"""Monthly dues: one row per student per month.

Rules (see plan §4):
- Calendar months. A student owes the FULL fee for the month they join, whatever the date.
- Dues start at max(joining month, TRACKING_START) and run to the current month.
- Left students: dues up to and including their leaving month. Paused students: no new dues.
- Amount = student's custom fee if set, else the fee-group rate effective for that month.
"""

from datetime import date

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dates import current_month, month_start
from app.models import FeeDue, FeeGroupRate, Student

_ENSURE_SQL = text("""
INSERT INTO fee_dues (student_id, period, amount_due, amount_paid, status)
SELECT s.id, p.period::date, COALESCE(s.custom_monthly_fee, r.monthly_amount), 0, 'unpaid'
FROM students s
CROSS JOIN LATERAL generate_series(
    date_trunc('month', GREATEST(s.joining_date, CAST(:start AS date)))::date,
    LEAST(CAST(:through AS date),
          COALESCE(date_trunc('month', s.leaving_date)::date, CAST(:through AS date))),
    interval '1 month'
) AS p(period)
LEFT JOIN LATERAL (
    SELECT fr.monthly_amount FROM fee_group_rates fr
    WHERE fr.fee_group_id = s.fee_group_id AND fr.effective_from <= p.period::date
    ORDER BY fr.effective_from DESC LIMIT 1
) r ON true
WHERE s.status IN ('active', 'left')
  AND COALESCE(s.custom_monthly_fee, r.monthly_amount) IS NOT NULL
  AND (CAST(:sid AS integer) IS NULL OR s.id = CAST(:sid AS integer))
ON CONFLICT (student_id, period) DO NOTHING
""")


def ensure_dues(db: Session, through: date | None = None, student_id: int | None = None) -> int:
    """Create any missing dues up to `through` (default: this month). Safe to call often."""
    through = month_start(through or current_month())
    result = db.execute(
        _ENSURE_SQL, {"start": get_settings().tracking_start, "through": through, "sid": student_id}
    )
    return result.rowcount or 0


def fee_for(db: Session, student: Student, period: date) -> int | None:
    if student.custom_monthly_fee is not None:
        return student.custom_monthly_fee
    return db.scalar(
        select(FeeGroupRate.monthly_amount)
        .where(FeeGroupRate.fee_group_id == student.fee_group_id, FeeGroupRate.effective_from <= period)
        .order_by(FeeGroupRate.effective_from.desc())
        .limit(1)
    )


def get_or_create_due(db: Session, student: Student, period: date) -> FeeDue | None:
    period = month_start(period)
    due = db.scalar(select(FeeDue).where(FeeDue.student_id == student.id, FeeDue.period == period))
    if due is None:
        amount = fee_for(db, student, period)
        if amount is None:
            return None
        due = FeeDue(student_id=student.id, period=period, amount_due=amount, amount_paid=0, status="unpaid")
        db.add(due)
        db.flush()
    return due


def reprice_untouched_dues(db: Session, student: Student, from_period: date) -> None:
    """After a fee change, update dues from `from_period` on that have no payments yet."""
    dues = db.scalars(
        select(FeeDue).where(
            FeeDue.student_id == student.id,
            FeeDue.period >= month_start(from_period),
            FeeDue.amount_paid == 0,
            FeeDue.status == "unpaid",
        )
    ).all()
    for due in dues:
        amount = fee_for(db, student, due.period)
        if amount is not None:
            due.amount_due = amount


def reprice_group(db: Session, fee_group_id: int, from_period: date) -> None:
    """After a group rate change, reprice untouched dues of students on the group fee."""
    db.execute(
        update(FeeDue)
        .where(
            FeeDue.period >= month_start(from_period),
            FeeDue.amount_paid == 0,
            FeeDue.status == "unpaid",
            FeeDue.student_id.in_(
                select(Student.id).where(
                    Student.fee_group_id == fee_group_id, Student.custom_monthly_fee.is_(None)
                )
            ),
        )
        .values(
            amount_due=select(FeeGroupRate.monthly_amount)
            .where(FeeGroupRate.fee_group_id == fee_group_id, FeeGroupRate.effective_from <= FeeDue.period)
            .order_by(FeeGroupRate.effective_from.desc())
            .limit(1)
            .scalar_subquery()
        )
        .execution_options(synchronize_session=False)
    )
