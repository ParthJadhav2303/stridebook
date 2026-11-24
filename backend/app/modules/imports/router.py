"""Import past payments from Excel. Two steps so nothing is saved by surprise:
1. POST /import/preview  (upload file) → every row checked, students matched, problems listed.
2. POST /import/commit   (rows + fee group for each new student) → saved in one transaction.
"""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dates import month_start, today
from app.core.db import get_db
from app.core.deps import require_admin
from app.models import FeeGroup, Payment, Student, User
from app.modules.activity.service import log, rupees
from app.modules.dues.service import ensure_dues
from app.modules.imports.parser import ImportFileError, normalize_name, parse_file
from app.modules.payments.service import PaymentRequest, record_payment

router = APIRouter(prefix="/import", tags=["import"])
MAX_BYTES = 3 * 1024 * 1024

RowStatus = Literal["ok", "new_student", "duplicate", "error"]


class PreviewRow(BaseModel):
    row: int
    student_name: str
    month: date | None
    paid_on: date | None
    amount: int | None
    mode: Literal["cash", "upi"]
    student_id: int | None
    status: RowStatus
    message: str | None


class NewStudent(BaseModel):
    name: str
    first_month: date
    rows: int
    total: int


class Preview(BaseModel):
    filename: str
    rows: list[PreviewRow]
    new_students: list[NewStudent]
    ok_rows: int
    error_rows: int
    duplicate_rows: int
    total_amount: int


class CommitRow(BaseModel):
    student_name: str = Field(min_length=1, max_length=100)
    month: date
    paid_on: date
    amount: int = Field(gt=0, le=200000)
    mode: Literal["cash", "upi"]


class CommitNewStudent(BaseModel):
    name: str
    fee_group_id: int


class CommitIn(BaseModel):
    filename: str = "import"
    rows: list[CommitRow] = Field(min_length=1, max_length=5000)
    new_students: list[CommitNewStudent] = []


class CommitOut(BaseModel):
    payments_created: int
    students_created: int
    total_amount: int


def _students_by_name(db: Session) -> dict[str, Student]:
    return {normalize_name(s.full_name): s for s in db.scalars(select(Student))}


def _existing_payment_keys(db: Session) -> set[tuple[int, date, int]]:
    return set(
        db.execute(
            select(Payment.student_id, Payment.paid_on, Payment.amount).where(Payment.is_voided.is_(False))
        )
        .tuples()
        .all()
    )


@router.post("/preview", response_model=Preview)
async def preview(
    file: UploadFile = File(...), _: User = Depends(require_admin), db: Session = Depends(get_db)
) -> Preview:
    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "The file is too big (3 MB maximum).")
    try:
        raw = parse_file(file.filename or "upload.xlsx", content)
    except ImportFileError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e

    students = _students_by_name(db)
    existing = _existing_payment_keys(db)
    seen: set[tuple[str, date | None, date | None, int | None]] = set()
    new: dict[str, NewStudent] = {}
    rows: list[PreviewRow] = []
    now = today()

    for r in raw:
        if r.paid_on and r.paid_on > now:
            r.errors.append("Date is in the future.")
        key = normalize_name(r.student_name)
        student = students.get(key)
        status_: RowStatus
        message = "; ".join(r.errors) or None
        if r.errors:
            status_ = "error"
        elif (key, r.month, r.paid_on, r.amount) in seen or (
            student and (student.id, r.paid_on, r.amount) in existing
        ):
            status_, message = "duplicate", "Looks already recorded (same student, date and amount). Skipped."
        elif student is None:
            status_ = "new_student"
            ns = new.get(key)
            if ns is None:
                new[key] = NewStudent(name=r.student_name, first_month=r.month, rows=1, total=r.amount)
            else:
                ns.rows += 1
                ns.total += r.amount
                ns.first_month = min(ns.first_month, r.month)
        else:
            status_ = "ok"
        seen.add((key, r.month, r.paid_on, r.amount))
        rows.append(
            PreviewRow(
                row=r.row,
                student_name=student.full_name if student else r.student_name,
                month=r.month,
                paid_on=r.paid_on,
                amount=r.amount,
                mode=r.mode,
                student_id=student.id if student else None,
                status=status_,
                message=message,
            )
        )

    good = [r for r in rows if r.status in ("ok", "new_student")]
    return Preview(
        filename=file.filename or "upload",
        rows=rows,
        new_students=sorted(new.values(), key=lambda n: n.name.lower()),
        ok_rows=len(good),
        error_rows=sum(r.status == "error" for r in rows),
        duplicate_rows=sum(r.status == "duplicate" for r in rows),
        total_amount=sum(r.amount or 0 for r in good),
    )


@router.post("/commit", response_model=CommitOut)
def commit(body: CommitIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> CommitOut:
    students = _students_by_name(db)
    groups = {g.id for g in db.scalars(select(FeeGroup))}
    new_groups = {normalize_name(n.name): n.fee_group_id for n in body.new_students}
    now = today()

    # Create the new students first, joining in the earliest month they paid for.
    first_month: dict[str, date] = {}
    for r in body.rows:
        key = normalize_name(r.student_name)
        if key not in students:
            first_month[key] = min(first_month.get(key, r.month), r.month)
    created = 0
    for key, month in first_month.items():
        group_id = new_groups.get(key)
        if group_id not in groups:
            name = next(r.student_name for r in body.rows if normalize_name(r.student_name) == key)
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"Choose a fee group for new student {name}."
            )
        name = next(r.student_name for r in body.rows if normalize_name(r.student_name) == key).strip()
        s = Student(
            full_name=name,
            fee_group_id=group_id,
            joining_date=month_start(month),
            status="active",
            created_by=admin.id,
        )
        db.add(s)
        db.flush()
        ensure_dues(db, student_id=s.id)
        students[key] = s
        created += 1

    total = 0
    for r in sorted(body.rows, key=lambda r: (r.paid_on, r.month)):
        if r.paid_on > now:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"{r.student_name}: date is in the future."
            )
        student = students[normalize_name(r.student_name)]
        record_payment(
            db,
            PaymentRequest(
                student_id=student.id,
                amount=r.amount,
                mode=r.mode,
                paid_on=r.paid_on,
                note="Imported from Excel",
                periods=[month_start(r.month)],
            ),
            admin,
        )
        total += r.amount

    log(
        db,
        admin,
        "import.commit",
        "import",
        None,
        f"Imported {len(body.rows)} payments ({rupees(total)}) and {created} new students "
        f"from {body.filename}.",
        {"rows": len(body.rows), "students_created": created, "total": total},
    )
    db.commit()
    return CommitOut(payments_created=len(body.rows), students_created=created, total_amount=total)
