"""Load the academy's FEE BOOK workbook into StrideBook.

The workbook has one sheet per month (e.g. "NOVEMBER 2026"). Each sheet has a title row, the month
as a date, and two side-by-side blocks, SMALL GROUP and BIG GROUP, each with the columns
    SR.NO | NAME | PAID/UNPAID | AMOUNT
"P" (or PAID / Y / ✓) in PAID/UNPAID means the month is paid. AMOUNT is optional: when it is empty the
group's fee for that month is used. Every listed student is created (so unpaid students show up as
Unpaid); paid ones get a payment for that month.

Safe to run again: students are matched by name and months that are already paid are skipped.

Usage (inside backend/, or `docker compose exec api ...` on the server):
    python -m app.ingest_feebook FEE_BOOK.xlsx --dry-run      # show what would happen
    python -m app.ingest_feebook FEE_BOOK.xlsx                # do it
Options: --sheet "NOVEMBER 2026"  --paid-on 2026-11-05  --mode upi  --as-user mom  --no-club-name
"""

import argparse
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dates import month_start, today
from app.core.db import SessionLocal
from app.models import AppSetting, FeeGroup, Payment, PaymentAllocation, Student, User
from app.modules.activity.service import log, rupees
from app.modules.dues.service import ensure_dues, get_or_create_due
from app.modules.imports.parser import parse_month
from app.modules.payments.service import PaymentRequest, record_payment

PAID_MARKS = {"p", "paid", "y", "yes", "✓", "✔", "done"}
UNPAID_MARKS = {"", "u", "unpaid", "n", "no", "x", "-"}
GROUP_ALIASES = {"small": "Small group", "big": "Big group"}
NOTE = "Imported from fee book"


@dataclass
class Entry:
    sheet: str
    row: int
    group: str  # "Small group" / "Big group"
    name: str
    paid: bool
    amount: int | None


@dataclass
class SheetData:
    title: str
    month: date
    entries: list[Entry] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class WorkbookData:
    club_title: str | None
    sheets: list[SheetData]


def tidy_name(raw: str) -> str:
    """'SHIVANI  Pisal ' → 'Shivani Pisal'."""
    words = re.sub(r"\s+", " ", raw).strip().split(" ")
    return " ".join(w[:1].upper() + w[1:].lower() if w.isalpha() else w for w in words)


def name_key(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().lower()


def _text(v) -> str:
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


def _sheet_month(ws) -> date | None:
    for row in ws.iter_rows(min_row=1, max_row=10, values_only=True):
        for v in row:
            if isinstance(v, datetime | date):
                return month_start(v.date() if isinstance(v, datetime) else v)
    try:  # fall back to the sheet name, e.g. "DECEMEBER 2026 " (typos happen)
        title = re.sub(r"[^a-z0-9 ]", "", ws.title.lower())
        m = re.search(r"([a-z]{3})[a-z]*\s*(\d{4})", title)
        return parse_month(f"{m.group(1)} {m.group(2)}", None) if m else None
    except ValueError:
        return None


def _amount(v) -> int | None:
    if v is None or _text(v) == "":
        return None
    if isinstance(v, int | float):
        return int(v) if v > 0 else None
    digits = re.sub(r"[^\d.]", "", str(v))
    return int(float(digits)) if digits else None


def parse_workbook(path: str | Path, only_sheet: str | None = None) -> WorkbookData:
    wb = load_workbook(path, data_only=True)
    club_title = None
    sheets: list[SheetData] = []
    for ws in wb.worksheets:
        if only_sheet and ws.title.strip().lower() != only_sheet.strip().lower():
            continue
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        if club_title is None and rows and rows[0] and rows[0][0]:
            club_title = _text(rows[0][0])
        month = _sheet_month(ws)
        sheet = SheetData(title=ws.title.strip(), month=month) if month else None
        if sheet is None:
            continue

        # Header row: the one with NAME columns. Group labels sit in a row above it.
        header_idx = next(
            (i for i, r in enumerate(rows[:20]) if sum(_text(c).lower() == "name" for c in r) >= 1),
            None,
        )
        if header_idx is None:
            sheet.warnings.append("No NAME column found; sheet skipped.")
            sheets.append(sheet)
            continue
        header = [_text(c).lower() for c in rows[header_idx]]
        blocks = []  # (group, name_col, status_col, amount_col)
        for col, h in enumerate(header):
            if h != "name":
                continue
            label = ""
            for up in range(header_idx - 1, -1, -1):  # nearest group label above, at or left of this block
                for c in range(col, max(col - 2, -1), -1):
                    if c < len(rows[up]) and "group" in _text(rows[up][c]).lower():
                        label = _text(rows[up][c]).lower()
                        break
                if label:
                    break
            group = next((g for k, g in GROUP_ALIASES.items() if k in label), None)
            if group is None:
                sheet.warnings.append(
                    f"Couldn't tell which group the NAME column {col + 1} belongs to; skipped."
                )
                continue
            status_col = next((c for c in range(col + 1, col + 3) if "paid" in header[c]), None)
            amount_col = next(
                (c for c in range(col + 1, col + 4) if c < len(header) and "amount" in header[c]), None
            )
            blocks.append((group, col, status_col, amount_col))

        for group, name_col, status_col, amount_col in blocks:
            for i, r in enumerate(rows[header_idx + 1 :], start=header_idx + 2):
                raw = _text(r[name_col]) if name_col < len(r) else ""
                if not raw:
                    continue
                mark = _text(r[status_col]).lower() if status_col is not None and status_col < len(r) else ""
                amount = _amount(r[amount_col]) if amount_col is not None and amount_col < len(r) else None
                if mark in PAID_MARKS or (amount and mark not in UNPAID_MARKS - {""}):
                    paid = True
                elif mark in UNPAID_MARKS:
                    paid = False
                else:
                    sheet.warnings.append(f"Row {i}: '{raw}' has '{mark}' in PAID/UNPAID; treated as unpaid.")
                    paid = False
                sheet.entries.append(Entry(ws.title.strip(), i, group, tidy_name(raw), paid, amount))

        seen: dict[str, Entry] = {}
        for e in sheet.entries:
            if name_key(e.name) in seen:
                first = seen[name_key(e.name)].row
                sheet.warnings.append(
                    f"'{e.name}' appears twice in {sheet.title} (rows {first} and {e.row})."
                )
            seen[name_key(e.name)] = e
        sheets.append(sheet)
    return WorkbookData(club_title=club_title, sheets=sheets)


def club_name_from_title(title: str | None) -> str | None:
    if not title:
        return None
    name = re.sub(r"\bfee\s*(report|book)\b", "", title, flags=re.I).strip(" -:")
    small = {"and", "of", "the"}
    return " ".join(
        w.lower() if w.lower() in small and i else w.capitalize() for i, w in enumerate(name.split())
    )


@dataclass
class Result:
    students_created: int = 0
    students_existing: int = 0
    payments_created: int = 0
    payments_skipped: int = 0
    total_amount: int = 0
    lines: list[str] = field(default_factory=list)


def apply(
    db: Session,
    data: WorkbookData,
    user: User,
    *,
    paid_on: date | None = None,
    mode: str = "cash",
    set_club_name: bool = True,
    filename: str = "fee book",
) -> Result:
    res = Result()
    groups = {g.name.lower(): g for g in db.scalars(select(FeeGroup))}
    students = {name_key(s.full_name): s for s in db.scalars(select(Student))}

    for sheet in sorted((s for s in data.sheets if s.entries), key=lambda s: s.month):
        for e in sheet.entries:
            group = groups.get(e.group.lower())
            if group is None:
                raise SystemExit(f"Fee group '{e.group}' doesn't exist in the database.")
            student = students.get(name_key(e.name))
            if student is None:
                student = Student(
                    full_name=e.name,
                    fee_group_id=group.id,
                    joining_date=sheet.month,
                    status="active",
                    created_by=user.id,
                )
                db.add(student)
                db.flush()
                students[name_key(e.name)] = student
                res.students_created += 1
                res.lines.append(f"+ student  {e.name} ({group.name}, from {sheet.month:%b %Y})")
            else:
                res.students_existing += 1
                if student.fee_group_id != group.id:
                    res.lines.append(f"! {e.name} is in a different group in the app; kept the app's group.")
            ensure_dues(db, through=max(sheet.month, month_start(today())), student_id=student.id)

            if not e.paid:
                continue
            due = get_or_create_due(db, student, sheet.month)
            if due is None:
                res.lines.append(f"! {e.name}: no fee set for {sheet.month:%b %Y}; payment skipped.")
                continue
            already = db.scalar(
                select(PaymentAllocation.id)
                .join(Payment, Payment.id == PaymentAllocation.payment_id)
                .where(
                    PaymentAllocation.fee_due_id == due.id, Payment.note == NOTE, Payment.is_voided.is_(False)
                )
                .limit(1)
            )
            if already or due.status in ("paid", "waived"):
                res.payments_skipped += 1
                continue
            amount = e.amount or (due.amount_due - due.amount_paid)
            pay_date = paid_on or sheet.month
            record_payment(
                db,
                PaymentRequest(
                    student_id=student.id,
                    amount=amount,
                    mode=mode,
                    paid_on=min(pay_date, today()),
                    note=NOTE,
                    periods=[sheet.month],
                ),
                user,
            )
            res.payments_created += 1
            res.total_amount += amount
            res.lines.append(f"+ payment  {e.name}: {rupees(amount)} for {sheet.month:%b %Y}")

    club = club_name_from_title(data.club_title)
    if set_club_name and club and db.get(AppSetting, "club_name") is None:
        db.add(AppSetting(key="club_name", value=club))
        if db.get(AppSetting, "club_short") is None:
            db.add(AppSetting(key="club_short", value="LJ Academy"))
        res.lines.append(f"+ club name set to '{club}'")

    log(
        db,
        user,
        "import.commit",
        "import",
        None,
        f"Loaded fee book {filename}: {res.students_created} new students, "
        f"{res.payments_created} payments ({rupees(res.total_amount)}).",
        {
            "students_created": res.students_created,
            "payments": res.payments_created,
            "total": res.total_amount,
        },
    )
    return res


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m app.ingest_feebook", description=__doc__.split("\n\n")[0])
    p.add_argument("file", help="FEE BOOK .xlsx")
    p.add_argument("--sheet", help="Only this sheet, e.g. 'NOVEMBER 2026' (default: every month sheet)")
    p.add_argument(
        "--paid-on", type=date.fromisoformat, help="Date to record payments on (default: 1st of the month)"
    )
    p.add_argument(
        "--mode", choices=["cash", "upi"], default="cash", help="Payment mode to record (default cash)"
    )
    p.add_argument("--as-user", help="Username to record payments as (default: first admin)")
    p.add_argument("--no-club-name", action="store_true", help="Don't set the club name from the sheet title")
    p.add_argument("--dry-run", action="store_true", help="Show what would happen; change nothing")
    args = p.parse_args(argv)

    data = parse_workbook(args.file, args.sheet)
    for s in data.sheets:
        paid = sum(e.paid for e in s.entries)
        print(f"Sheet '{s.title}' ({s.month:%B %Y}): {len(s.entries)} students, {paid} marked paid")
        for w in s.warnings:
            print(f"  warning: {w}")
    if not any(s.entries for s in data.sheets):
        print("Nothing to import.")
        return 1

    with SessionLocal() as db:
        q = select(User).where(User.is_active.is_(True))
        q = q.where(User.username == args.as_user.lower()) if args.as_user else q.where(User.role == "admin")
        user = db.scalar(q.order_by(User.id))
        if user is None:
            print("No admin user found. Create one first:")
            print("  python -m app.cli create-user --username mom --name <name> --role admin")
            return 1
        res = apply(
            db,
            data,
            user,
            paid_on=args.paid_on,
            mode=args.mode,
            set_club_name=not args.no_club_name,
            filename=Path(args.file).name,
        )
        for line in res.lines:
            print("  " + line)
        print(
            f"\n{'Would create' if args.dry_run else 'Created'} {res.students_created} students "
            f"({res.students_existing} already there), {res.payments_created} payments worth "
            f"{rupees(res.total_amount)}; {res.payments_skipped} months already paid were skipped."
        )
        if args.dry_run:
            db.rollback()
            print("Dry run: nothing was saved.")
        else:
            db.commit()
    return 0


if __name__ == "__main__":
    sys.exit(main())
