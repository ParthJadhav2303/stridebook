"""Excel export of one month: who owes what, and every payment received."""

import io
from datetime import date

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.dates import current_month
from app.models import FeeDue, FeeGroup, Student
from app.modules.payments.router import list_payments_query
from app.modules.students.router import outstanding_subquery

HEADER_FILL = PatternFill("solid", fgColor="0F2A4A")
HEADER_FONT = Font(bold=True, color="FFFFFF")
STATUS_FILL = {
    "paid": PatternFill("solid", fgColor="DCFCE7"),
    "partial": PatternFill("solid", fgColor="FEF3C7"),
    "unpaid": PatternFill("solid", fgColor="FEE2E2"),
}
STATUS_LABEL = {"paid": "Paid", "partial": "Part paid", "unpaid": "Unpaid", "waived": "Waived"}
RUPEES = '"₹"#,##,##0'


def _sheet(ws, title: str, headers: list[str], rows: list[list], money_cols: set[int], widths: list[int]):
    ws.title = title
    ws.append(headers)
    for cell in ws[1]:
        cell.fill, cell.font = HEADER_FILL, HEADER_FONT
        cell.alignment = Alignment(vertical="center")
    for row in rows:
        ws.append(row)
    for col in money_cols:
        for (cell,) in ws.iter_rows(min_row=2, min_col=col, max_col=col):
            cell.number_format = RUPEES
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions


def month_workbook(db: Session, month: date, club_name: str) -> bytes:
    owed = outstanding_subquery(current_month())
    dues = db.execute(
        select(FeeDue, Student.full_name, Student.parent_phone, FeeGroup.name, owed.c.amount)
        .join(Student, Student.id == FeeDue.student_id)
        .join(FeeGroup, FeeGroup.id == Student.fee_group_id)
        .outerjoin(owed, owed.c.student_id == Student.id)
        .where(FeeDue.period == month)
        .order_by(func.lower(Student.full_name))
    ).all()

    wb = Workbook()
    label = month.strftime("%b %Y")
    dues_rows = [
        [
            name,
            group,
            phone or "",
            d.amount_due,
            d.amount_paid,
            d.amount_due - d.amount_paid,
            STATUS_LABEL[d.status],
            total or 0,
        ]
        for d, name, phone, group, total in dues
    ]
    _sheet(
        wb.active,
        f"Fees {label}",
        [
            "Student",
            "Group",
            "Parent phone",
            "Fee",
            "Paid",
            "Still due",
            "Status",
            "Total pending (all months)",
        ],
        dues_rows,
        {4, 5, 6, 8},
        [26, 14, 16, 10, 10, 11, 11, 26],
    )
    for row_idx, (d, *_rest) in enumerate(dues, start=2):
        fill = STATUS_FILL.get(d.status)
        if fill:
            wb.active.cell(row=row_idx, column=7).fill = fill
    total_row = len(dues_rows) + 2
    ws = wb.active
    ws.cell(row=total_row, column=1, value="Total").font = Font(bold=True)
    for col in (4, 5, 6):
        letter = get_column_letter(col)
        c = ws.cell(row=total_row, column=col, value=f"=SUM({letter}2:{letter}{total_row - 1})")
        c.number_format, c.font = RUPEES, Font(bold=True)

    payments = list_payments_query(db, month=month, limit=5000)
    pay_rows = [
        [
            p.paid_on,
            p.receipt_no,
            p.student_name,
            p.amount,
            "UPI" if p.mode == "upi" else "Cash",
            ", ".join(m.period.strftime("%b %Y") for m in p.months),
            p.received_by_name,
            p.note or "",
        ]
        for p in sorted(payments, key=lambda p: (p.paid_on, p.receipt_no))
    ]
    ws2 = wb.create_sheet()
    _sheet(
        ws2,
        f"Payments {label}",
        ["Date", "Receipt", "Student", "Amount", "Mode", "For months", "Received by", "Note"],
        pay_rows,
        {4},
        [12, 15, 26, 10, 8, 24, 18, 30],
    )
    for (cell,) in ws2.iter_rows(min_row=2, min_col=1, max_col=1):
        cell.number_format = "DD-MMM-YYYY"
    end = len(pay_rows) + 2
    ws2.cell(row=end, column=3, value="Total").font = Font(bold=True)
    c = ws2.cell(row=end, column=4, value=f"=SUM(D2:D{end - 1})")
    c.number_format, c.font = RUPEES, Font(bold=True)

    wb.properties.title = f"{club_name} fees {label}"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
