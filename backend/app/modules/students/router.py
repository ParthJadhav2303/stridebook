from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.core.dates import current_month, month_start, parse_month, today
from app.core.db import get_db
from app.core.deps import get_current_user
from app.models import FeeDue, FeeGroup, Student, User
from app.modules.activity.service import log
from app.modules.dues.service import ensure_dues, fee_for, reprice_untouched_dues
from app.modules.students.schemas import Ledger, LedgerMonth, StudentCreate, StudentOut, StudentUpdate

router = APIRouter(prefix="/students", tags=["students"])


def outstanding_subquery(through: date):
    return (
        select(
            FeeDue.student_id.label("student_id"),
            func.sum(FeeDue.amount_due - FeeDue.amount_paid).label("amount"),
            func.count().label("months"),
        )
        .where(FeeDue.period <= through, FeeDue.status.in_(("unpaid", "partial")))
        .group_by(FeeDue.student_id)
        .subquery()
    )


def query_students(db: Session, month: date, student_id: int | None = None):
    """Students with their status for `month` and total outstanding up to this month."""
    this = aliased(FeeDue)
    owed = outstanding_subquery(current_month())
    stmt = (
        select(Student, FeeGroup.name, this, owed.c.amount, owed.c.months)
        .join(FeeGroup, FeeGroup.id == Student.fee_group_id)
        .outerjoin(this, and_(this.student_id == Student.id, this.period == month))
        .outerjoin(owed, owed.c.student_id == Student.id)
    )
    if student_id is not None:
        stmt = stmt.where(Student.id == student_id)
    return stmt, this


def to_out(db: Session, row) -> StudentOut:
    student, group_name, due, owed_amount, owed_months = row
    return StudentOut(
        **{k: getattr(student, k) for k in StudentOut.model_fields if hasattr(student, k)},
        fee_group_name=group_name,
        monthly_fee=fee_for(db, student, current_month()),
        month_status=due.status if due else None,
        month_due=due.amount_due if due else None,
        month_paid=due.amount_paid if due else None,
        outstanding_amount=owed_amount or 0,
        outstanding_months=owed_months or 0,
    )


def get_student_out(db: Session, student_id: int, month: date | None = None) -> StudentOut:
    stmt, _ = query_students(db, month or current_month(), student_id)
    row = db.execute(stmt).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")
    return to_out(db, row)


@router.get("", response_model=list[StudentOut])
def list_students(
    q: str | None = None,
    fee_group_id: int | None = None,
    student_status: Literal["active", "paused", "left", "all"] = Query("active", alias="status"),
    month: str | None = Query(None, description="YYYY-MM, default this month"),
    month_status: Literal["unpaid", "partial", "paid", "pending"] | None = Query(
        None, description="pending = unpaid or partial"
    ),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_dues(db)
    db.commit()
    m = parse_month(month)
    stmt, this = query_students(db, m)
    if student_status != "all":
        stmt = stmt.where(Student.status == student_status)
    if fee_group_id:
        stmt = stmt.where(Student.fee_group_id == fee_group_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Student.full_name.ilike(like),
                Student.parent_name.ilike(like),
                Student.parent_phone.ilike(like),
            )
        )
    if month_status == "pending":
        stmt = stmt.where(this.status.in_(("unpaid", "partial")))
    elif month_status:
        stmt = stmt.where(this.status == month_status)
    stmt = stmt.order_by(func.lower(Student.full_name))
    return [to_out(db, row) for row in db.execute(stmt).all()]


@router.post("", response_model=StudentOut, status_code=status.HTTP_201_CREATED)
def create_student(
    body: StudentCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if db.get(FeeGroup, body.fee_group_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose a valid fee group.")
    data = body.model_dump()
    data["joining_date"] = data["joining_date"] or today()
    student = Student(**data, status="active", created_by=user.id)
    db.add(student)
    db.flush()
    ensure_dues(db, student_id=student.id)
    group = db.get(FeeGroup, student.fee_group_id)
    log(db, user, "student.create", "student", student.id, f"Added {student.full_name} to {group.name}.")
    db.commit()
    return get_student_out(db, student.id)


@router.get("/{student_id}", response_model=StudentOut)
def get_student(
    student_id: int,
    month: str | None = None,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_dues(db, student_id=student_id)
    db.commit()
    return get_student_out(db, student_id, parse_month(month))


@router.patch("/{student_id}", response_model=StudentOut)
def update_student(
    student_id: int,
    body: StudentUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    student = db.get(Student, student_id, with_for_update=True)
    if student is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")
    changes = body.model_dump(exclude_unset=True)
    before = {k: getattr(student, k) for k in changes}
    if "fee_group_id" in changes and db.get(FeeGroup, changes["fee_group_id"]) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose a valid fee group.")
    fee_changed = any(k in changes for k in ("fee_group_id", "custom_monthly_fee"))

    for key, value in changes.items():
        setattr(student, key, value)
    if student.status == "left" and student.leaving_date is None:
        student.leaving_date = today()
    if student.status == "active":
        student.leaving_date = None

    db.flush()
    if student.status == "left" and student.leaving_date:
        # Months after leaving that nobody has paid towards are no longer owed.
        db.execute(
            delete(FeeDue).where(
                FeeDue.student_id == student.id,
                FeeDue.period > month_start(student.leaving_date),
                FeeDue.amount_paid == 0,
                FeeDue.status == "unpaid",
            )
        )
    if fee_changed:
        reprice_untouched_dues(db, student, current_month())
    ensure_dues(db, student_id=student.id)
    changed = {k: (str(before[k]), str(v)) for k, v in changes.items() if before[k] != v}
    if changed:
        what = ", ".join(k.replace("_", " ") for k in changed)
        summary = f"Updated {student.full_name}: {what}."
        if "status" in changed:
            summary = f"Marked {student.full_name} as {student.status}." + (
                f" Also changed {what}." if len(changed) > 1 else ""
            )
        log(db, user, "student.update", "student", student.id, summary, {"changes": changed})
    db.commit()
    return get_student_out(db, student.id)


@router.get("/{student_id}/ledger", response_model=Ledger)
def ledger(
    student_id: int,
    year: int | None = None,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if db.get(Student, student_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")
    ensure_dues(db, student_id=student_id)
    db.commit()
    year = year or today().year
    dues = {
        d.period: d
        for d in db.scalars(
            select(FeeDue).where(
                FeeDue.student_id == student_id,
                FeeDue.period >= date(year, 1, 1),
                FeeDue.period <= date(year, 12, 1),
            )
        )
    }
    months = []
    for m in range(1, 13):
        p = date(year, m, 1)
        d = dues.get(p)
        months.append(
            LedgerMonth(
                period=p,
                amount_due=d.amount_due if d else None,
                amount_paid=d.amount_paid if d else None,
                status=d.status if d else None,
            )
        )
    return Ledger(year=year, months=months)
