from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.dates import add_months, parse_month, today
from app.core.db import get_db
from app.core.deps import get_current_user
from app.models import Payment, PaymentAllocation, Student, User
from app.modules.payments.service import PaymentRequest, record_payment

router = APIRouter(prefix="/payments", tags=["payments"])


class PaymentIn(BaseModel):
    student_id: int
    amount: int = Field(gt=0, le=200000)
    mode: Literal["cash", "upi"]
    paid_on: date | None = None  # default today
    note: str | None = Field(default=None, max_length=500)
    months: list[str] | None = Field(default=None, description="Optional ['2026-10', '2026-11']")

    @field_validator("paid_on")
    @classmethod
    def not_future(cls, v: date | None) -> date | None:
        if v and v > today():
            raise ValueError("Payment date can't be in the future.")
        return v


class AllocationOut(BaseModel):
    period: date
    amount: int


class PaymentOut(BaseModel):
    id: int
    receipt_no: str
    student_id: int
    student_name: str
    amount: int
    mode: str
    paid_on: date
    note: str | None
    received_by_name: str
    created_at: datetime
    months: list[AllocationOut]


def payment_out(p: Payment, student_name: str, receiver_name: str) -> PaymentOut:
    return PaymentOut(
        id=p.id,
        receipt_no=p.receipt_no,
        student_id=p.student_id,
        student_name=student_name,
        amount=p.amount,
        mode=p.mode,
        paid_on=p.paid_on,
        note=p.note,
        received_by_name=receiver_name,
        created_at=p.created_at,
        months=sorted(
            (AllocationOut(period=a.fee_due.period, amount=a.amount) for a in p.allocations),
            key=lambda a: a.period,
        ),
    )


def list_payments_query(db: Session, *, student_id=None, month: date | None = None, limit: int = 50):
    stmt = (
        select(Payment, Student.full_name, User.full_name)
        .join(Student, Student.id == Payment.student_id)
        .join(User, User.id == Payment.received_by)
        .where(Payment.is_voided.is_(False))
        .options(selectinload(Payment.allocations).selectinload(PaymentAllocation.fee_due))
        .order_by(Payment.paid_on.desc(), Payment.id.desc())
        .limit(limit)
    )
    if student_id:
        stmt = stmt.where(Payment.student_id == student_id)
    if month:
        stmt = stmt.where(Payment.paid_on >= month, Payment.paid_on < add_months(month, 1))
    return [payment_out(p, s, u) for p, s, u in db.execute(stmt).all()]


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(body: PaymentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        periods = [parse_month(m) for m in body.months] if body.months else None
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e
    payment = record_payment(
        db,
        PaymentRequest(
            student_id=body.student_id,
            amount=body.amount,
            mode=body.mode,
            paid_on=body.paid_on or today(),
            note=body.note,
            periods=periods,
        ),
        user,
    )
    db.commit()
    return get_payment(payment.id, user, db)


@router.get("", response_model=list[PaymentOut])
def list_payments(
    student_id: int | None = None,
    month: str | None = Query(None, description="YYYY-MM: payments received in this month"),
    limit: int = Query(50, le=500),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_payments_query(
        db, student_id=student_id, month=parse_month(month) if month else None, limit=limit
    )


@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(payment_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.execute(
        select(Payment, Student.full_name, User.full_name)
        .join(Student, Student.id == Payment.student_id)
        .join(User, User.id == Payment.received_by)
        .where(Payment.id == payment_id)
        .options(selectinload(Payment.allocations).selectinload(PaymentAllocation.fee_due))
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found.")
    return payment_out(*row)
