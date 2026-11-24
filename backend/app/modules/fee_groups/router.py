from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.dates import current_month, month_start, parse_month
from app.core.db import get_db
from app.core.deps import get_current_user, require_admin
from app.models import FeeGroup, FeeGroupRate, User
from app.modules.activity.service import log, rupees
from app.modules.dues.service import reprice_group

router = APIRouter(prefix="/fee-groups", tags=["fee groups"])


class RateOut(BaseModel):
    monthly_amount: int
    effective_from: date


class FeeGroupOut(BaseModel):
    id: int
    name: str
    current_amount: int | None
    rates: list[RateOut]


class RateIn(BaseModel):
    monthly_amount: int = Field(gt=0, le=100000)
    effective_from: str = Field(description="Month the new amount applies from, e.g. 2027-01")


def _out(group: FeeGroup) -> FeeGroupOut:
    today = current_month()
    current = next((r.monthly_amount for r in group.rates if r.effective_from <= today), None)
    return FeeGroupOut(
        id=group.id,
        name=group.name,
        current_amount=current,
        rates=[
            RateOut(monthly_amount=r.monthly_amount, effective_from=r.effective_from) for r in group.rates
        ],
    )


@router.get("", response_model=list[FeeGroupOut])
def list_groups(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    groups = db.scalars(
        select(FeeGroup)
        .where(FeeGroup.is_active.is_(True))
        .options(selectinload(FeeGroup.rates))
        .order_by(FeeGroup.sort_order)
    ).all()
    return [_out(g) for g in groups]


@router.post("/{group_id}/rates", response_model=FeeGroupOut)
def set_rate(
    group_id: int, body: RateIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    group = db.get(FeeGroup, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fee group not found.")
    try:
        effective = month_start(parse_month(body.effective_from))
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e

    existing = db.scalar(
        select(FeeGroupRate).where(
            FeeGroupRate.fee_group_id == group_id, FeeGroupRate.effective_from == effective
        )
    )
    if existing:
        existing.monthly_amount = body.monthly_amount
        existing.created_by = admin.id
    else:
        db.add(
            FeeGroupRate(
                fee_group_id=group_id,
                monthly_amount=body.monthly_amount,
                effective_from=effective,
                created_by=admin.id,
            )
        )
    db.flush()
    reprice_group(db, group_id, effective)
    log(
        db,
        admin,
        "fee.rate",
        "fee_group",
        group_id,
        f"Set {group.name} fee to {rupees(body.monthly_amount)} from {effective.strftime('%B %Y')}.",
    )
    db.commit()
    db.refresh(group)
    return _out(group)
