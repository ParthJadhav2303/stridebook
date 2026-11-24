"""Recording a payment and spreading it over months.

- If months are chosen, fill those first (in date order).
- Otherwise fill the oldest unpaid/partial months first.
- Money left over is treated as advance: it fills the next months after the latest month that
  has a due (up to 12 months ahead).
"""

from dataclasses import dataclass
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.dates import add_months, current_month, month_start
from app.models import FeeDue, Payment, PaymentAllocation, Student, User
from app.modules.dues.service import ensure_dues, get_or_create_due

MAX_ADVANCE_MONTHS = 12


@dataclass
class PaymentRequest:
    student_id: int
    amount: int
    mode: str
    paid_on: date
    note: str | None
    periods: list[date] | None


def _next_receipt_no(db: Session, paid_on: date) -> str:
    n = db.execute(text("SELECT nextval('receipt_no_seq')")).scalar_one()
    return f"SB-{paid_on.year}-{n:05d}"


def record_payment(db: Session, req: PaymentRequest, user: User) -> Payment:
    # Lock the student row so two coaches recording at once can't double-fill a month.
    student = db.get(Student, req.student_id, with_for_update=True)
    if student is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")
    ensure_dues(db, student_id=student.id)

    payment = Payment(
        receipt_no=_next_receipt_no(db, req.paid_on),
        student_id=student.id,
        amount=req.amount,
        mode=req.mode,
        paid_on=req.paid_on,
        note=(req.note or "").strip() or None,
        received_by=user.id,
        is_voided=False,
    )
    db.add(payment)
    db.flush()

    remaining = req.amount

    def allocate(due: FeeDue) -> None:
        nonlocal remaining
        open_amount = due.amount_due - due.amount_paid
        if due.status == "waived" or open_amount <= 0 or remaining <= 0:
            return
        take = min(open_amount, remaining)
        db.add(PaymentAllocation(payment_id=payment.id, fee_due_id=due.id, amount=take))
        due.amount_paid += take
        due.refresh_status()
        remaining -= take

    if req.periods:
        for period in sorted({month_start(p) for p in req.periods}):
            due = get_or_create_due(db, student, period)
            if due is None:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No fee is set for this student.")
            allocate(due)
    else:
        open_dues = db.scalars(
            select(FeeDue)
            .where(FeeDue.student_id == student.id, FeeDue.status.in_(("unpaid", "partial")))
            .order_by(FeeDue.period)
            .with_for_update()
        ).all()
        for due in open_dues:
            allocate(due)

    # Advance payment for the months after the latest existing due.
    if remaining > 0:
        if student.status != "active":
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"₹{remaining} more than this student owes. Advance payments are only for active students.",
            )
        latest = db.scalar(
            select(FeeDue.period).where(FeeDue.student_id == student.id).order_by(FeeDue.period.desc())
        )
        period = add_months(latest or current_month(), 1)
        for _ in range(MAX_ADVANCE_MONTHS):
            if remaining <= 0:
                break
            due = get_or_create_due(db, student, period)
            if due is None:
                break
            allocate(due)
            period = add_months(period, 1)
        if remaining > 0:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Amount is more than 12 months of fees. Check the amount.",
            )

    db.flush()
    return payment
