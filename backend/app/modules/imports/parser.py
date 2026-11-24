"""Read the club's simple Excel/CSV sheet: Student name · Month · Date · Amount paid (· Mode, optional).

Real sheets are messy, so this is forgiving about header names, month/date formats and ₹ signs,
and reports a clear message for each row it can't understand.
"""

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime

from openpyxl import load_workbook

HEADERS = {
    "name": ("student name", "student", "name", "child name", "student's name"),
    "month": ("month", "fee month", "for month", "month paid for"),
    "date": ("date", "paid on", "payment date", "date paid", "date of payment"),
    "amount": ("amount paid", "amount", "paid", "fees paid", "fee paid", "fees"),
    "mode": ("mode", "payment mode", "paid by", "cash/upi", "method"),
}
UPI_WORDS = ("upi", "gpay", "google pay", "phonepe", "phone pe", "paytm", "online", "bhim")
MONTHS = {
    m: i
    for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1
    )
}
MAX_ROWS = 5000


class ImportFileError(ValueError):
    pass


@dataclass
class RawRow:
    row: int
    student_name: str
    month: date | None
    paid_on: date | None
    amount: int | None
    mode: str
    errors: list[str] = field(default_factory=list)


def _norm(v) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip().lower()


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().lower()


def _cells_from_file(filename: str, content: bytes) -> list[list]:
    lower = filename.lower()
    if lower.endswith(".csv"):
        text = content.decode("utf-8-sig", errors="replace")
        return [row for row in csv.reader(io.StringIO(text))]
    if lower.endswith((".xlsx", ".xlsm")):
        try:
            wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        except Exception as e:
            raise ImportFileError(
                "This file couldn't be opened as Excel. Save it as .xlsx and try again."
            ) from e
        ws = wb.worksheets[0]
        return [list(r) for r in ws.iter_rows(values_only=True)]
    raise ImportFileError("Upload an Excel file (.xlsx) or a CSV file.")


def _find_header(rows: list[list]) -> tuple[int, dict[str, int]]:
    for idx, row in enumerate(rows[:15]):
        cells = [_norm(c) for c in row]
        found: dict[str, int] = {}
        for key, names in HEADERS.items():
            for col, value in enumerate(cells):
                if value in names and col not in found.values():
                    found[key] = col
                    break
        if {"name", "amount"} <= found.keys() and ("month" in found or "date" in found):
            return idx, found
    raise ImportFileError(
        "Couldn't find the column headings. "
        "The first row should have: Student name, Month, Date, Amount paid."
    )


def parse_date(v) -> date | None:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    for fmt in (
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d.%m.%Y",
        "%Y-%m-%d",
        "%d/%m/%y",
        "%d-%m-%y",
        "%d %b %Y",
        "%d %B %Y",
        "%d-%b-%Y",
        "%d-%b-%y",
    ):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Date '{s}' isn't a date I recognise. Use a form like 24/11/2026.")


def parse_month(v, fallback_year: int | None) -> date | None:
    if v is None or v == "":
        return None
    if isinstance(v, datetime | date):
        d = v.date() if isinstance(v, datetime) else v
        return d.replace(day=1)
    s = str(v).strip().lower().replace(",", " ").replace("'", " ")
    m = re.fullmatch(r"(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?", s)  # 2026-11 or 2026-11-01
    if m:
        return date(int(m.group(1)), int(m.group(2)), 1)
    m = re.fullmatch(r"(\d{1,2})[-/.](\d{4})", s)  # 11/2026
    if m:
        return date(int(m.group(2)), int(m.group(1)), 1)
    m = re.fullmatch(r"([a-z]+)[\s\-/.]*(\d{2}|\d{4})?", s)  # Nov 2026, November, Nov-26
    if m and m.group(1)[:3] in MONTHS:
        month = MONTHS[m.group(1)[:3]]
        year_s = m.group(2)
        if year_s:
            year = int(year_s) + (2000 if len(year_s) == 2 else 0)
        elif fallback_year:
            year = fallback_year
        else:
            raise ValueError(f"Month '{v}' has no year and there is no date to take it from.")
        return date(year, month, 1)
    raise ValueError(f"Month '{v}' isn't a month I recognise. Use a form like Nov 2026.")


def parse_amount(v) -> int:
    if isinstance(v, int | float):
        amount = float(v)
    else:
        s = re.sub(r"[₹,\s]|rs\.?|inr", "", str(v or "").lower())
        if not s:
            raise ValueError("Amount is empty.")
        try:
            amount = float(s)
        except ValueError as e:
            raise ValueError(f"Amount '{v}' isn't a number.") from e
    if amount <= 0:
        raise ValueError("Amount must be more than zero.")
    if amount != int(amount):
        raise ValueError(f"Amount {amount} has paise; use whole rupees.")
    return int(amount)


def parse_file(filename: str, content: bytes) -> list[RawRow]:
    rows = _cells_from_file(filename, content)
    header_idx, cols = _find_header(rows)
    out: list[RawRow] = []
    for offset, cells in enumerate(rows[header_idx + 1 :], start=header_idx + 2):

        def get(key: str, cells=cells):
            return cells[cols[key]] if key in cols and cols[key] < len(cells) else None

        name = re.sub(r"\s+", " ", str(get("name") or "")).strip()
        if not name and get("amount") in (None, ""):
            continue  # blank line
        r = RawRow(row=offset, student_name=name, month=None, paid_on=None, amount=None, mode="cash")
        if not name:
            r.errors.append("Student name is empty.")
        try:
            r.paid_on = parse_date(get("date"))
        except ValueError as e:
            r.errors.append(str(e))
        try:
            r.month = parse_month(get("month"), r.paid_on.year if r.paid_on else None)
        except ValueError as e:
            r.errors.append(str(e))
        if r.month is None and r.paid_on is not None and not r.errors:
            r.month = r.paid_on.replace(day=1)  # no Month column: the month it was paid in
        if r.month is None and not any("Month" in e for e in r.errors):
            r.errors.append("Month is empty.")
        if r.paid_on is None and r.month is not None:
            r.paid_on = r.month  # no date given: count it as paid on the 1st of that month
        try:
            r.amount = parse_amount(get("amount"))
        except ValueError as e:
            r.errors.append(str(e))
        mode = _norm(get("mode"))
        r.mode = "upi" if any(w in mode for w in UPI_WORDS) else "cash"
        out.append(r)
        if len(out) > MAX_ROWS:
            raise ImportFileError(f"The file has more than {MAX_ROWS} rows. Split it into smaller files.")
    if not out:
        raise ImportFileError("The file has headings but no payment rows.")
    return out
