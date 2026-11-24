from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.dates import add_months, current_month, parse_month
from app.core.db import get_db
from app.core.deps import get_current_user
from app.models import FeeDue, Payment, Student, User
from app.modules.dues.service import ensure_dues
from app.modules.payments.router import PaymentOut, list_payments_query

router = APIRouter(prefix="/reports", tags=["reports"])


class Dashboard(BaseModel):
    month: date
    # Fees for this month
    expected: int  # total of this month's dues
    received_for_month: int  # paid against this month's dues (whenever paid)
    pending_for_month: int
    students_paid: int
    students_partial: int
    students_unpaid: int
    # Money that came in during this month (for any months)
    collected_in_month: int
    collected_cash: int
    collected_upi: int
    # All months up to now
    total_outstanding: int
    students_with_dues: int
    active_students: int
    recent_payments: list[PaymentOut]


@router.get("/dashboard", response_model=Dashboard)
def dashboard(
    month: str | None = Query(None, description="YYYY-MM, default this month"),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_dues(db)
    db.commit()
    m = parse_month(month)

    dues = db.execute(
        select(
            func.coalesce(func.sum(FeeDue.amount_due), 0),
            func.coalesce(func.sum(FeeDue.amount_paid), 0),
            func.count().filter(FeeDue.status == "paid"),
            func.count().filter(FeeDue.status == "partial"),
            func.count().filter(FeeDue.status == "unpaid"),
        ).where(FeeDue.period == m, FeeDue.status != "waived")
    ).one()

    paid_in_month = (
        (Payment.paid_on >= m) & (Payment.paid_on < add_months(m, 1)) & Payment.is_voided.is_(False)
    )
    collected = db.execute(
        select(
            func.coalesce(func.sum(Payment.amount), 0),
            func.coalesce(func.sum(case((Payment.mode == "cash", Payment.amount), else_=0)), 0),
            func.coalesce(func.sum(case((Payment.mode == "upi", Payment.amount), else_=0)), 0),
        ).where(paid_in_month)
    ).one()

    outstanding = db.execute(
        select(
            func.coalesce(func.sum(FeeDue.amount_due - FeeDue.amount_paid), 0),
            func.count(func.distinct(FeeDue.student_id)),
        ).where(FeeDue.period <= current_month(), FeeDue.status.in_(("unpaid", "partial")))
    ).one()

    active = db.scalar(select(func.count()).where(Student.status == "active"))

    return Dashboard(
        month=m,
        expected=dues[0],
        received_for_month=dues[1],
        pending_for_month=dues[0] - dues[1],
        students_paid=dues[2],
        students_partial=dues[3],
        students_unpaid=dues[4],
        collected_in_month=collected[0],
        collected_cash=collected[1],
        collected_upi=collected[2],
        total_outstanding=outstanding[0],
        students_with_dues=outstanding[1],
        active_students=active,
        recent_payments=list_payments_query(db, month=m, limit=8),
    )
