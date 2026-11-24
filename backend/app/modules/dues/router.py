from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.dates import current_month, parse_month
from app.core.db import get_db
from app.core.deps import get_current_user, require_admin
from app.models import FeeDue, FeeGroup, Student, User
from app.modules.dues.service import ensure_dues
from app.modules.students.router import outstanding_subquery

router = APIRouter(prefix="/dues", tags=["dues"])


class DueRow(BaseModel):
    due_id: int
    student_id: int
    student_name: str
    parent_phone: str | None
    fee_group_name: str
    period: date
    amount_due: int
    amount_paid: int
    status: str
    outstanding_amount: int
    outstanding_months: int


class DuesSummary(BaseModel):
    month: date
    counts: dict[str, int]
    rows: list[DueRow]


@router.get("", response_model=DuesSummary)
def list_dues(
    month: str | None = Query(None, description="YYYY-MM, default this month"),
    due_status: Literal["unpaid", "partial", "paid", "waived", "pending"] | None = Query(
        None, alias="status"
    ),
    fee_group_id: int | None = None,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_dues(db)
    db.commit()
    m = parse_month(month)
    owed = outstanding_subquery(current_month())
    base = (
        select(FeeDue, Student.full_name, Student.parent_phone, FeeGroup.name, owed.c.amount, owed.c.months)
        .join(Student, Student.id == FeeDue.student_id)
        .join(FeeGroup, FeeGroup.id == Student.fee_group_id)
        .outerjoin(owed, owed.c.student_id == Student.id)
        .where(FeeDue.period == m)
    )
    if fee_group_id:
        base = base.where(Student.fee_group_id == fee_group_id)

    sub = base.subquery()
    counts_stmt = select(sub.c.status, func.count()).group_by(sub.c.status)
    counts = {"unpaid": 0, "partial": 0, "paid": 0, "waived": 0}
    counts.update(dict(db.execute(counts_stmt).tuples().all()))

    stmt = base
    if due_status == "pending":
        stmt = stmt.where(FeeDue.status.in_(("unpaid", "partial")))
    elif due_status:
        stmt = stmt.where(FeeDue.status == due_status)
    stmt = stmt.order_by(func.lower(Student.full_name))

    rows = [
        DueRow(
            due_id=d.id,
            student_id=d.student_id,
            student_name=name,
            parent_phone=phone,
            fee_group_name=group,
            period=d.period,
            amount_due=d.amount_due,
            amount_paid=d.amount_paid,
            status=d.status,
            outstanding_amount=o_amount or 0,
            outstanding_months=o_months or 0,
        )
        for d, name, phone, group, o_amount, o_months in db.execute(stmt).all()
    ]
    return DuesSummary(month=m, counts=counts, rows=rows)


@router.post("/generate")
def generate(month: str | None = None, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    created = ensure_dues(db, parse_month(month))
    db.commit()
    return {"created": created}
