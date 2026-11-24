from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_admin
from app.models import AuditLog, User

router = APIRouter(prefix="/activity", tags=["activity"])


class ActivityOut(BaseModel):
    id: int
    action: str
    entity: str
    entity_id: int | None
    summary: str
    user_name: str | None
    created_at: datetime


@router.get("", response_model=list[ActivityOut])
def list_activity(
    before_id: int | None = Query(None, description="For paging: entries older than this id"),
    limit: int = Query(50, le=200),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = (
        select(AuditLog, User.full_name)
        .outerjoin(User, User.id == AuditLog.user_id)
        .order_by(AuditLog.id.desc())
        .limit(limit)
    )
    if before_id:
        stmt = stmt.where(AuditLog.id < before_id)
    return [
        ActivityOut(
            id=a.id,
            action=a.action,
            entity=a.entity,
            entity_id=a.entity_id,
            summary=a.summary,
            user_name=name,
            created_at=a.created_at,
        )
        for a, name in db.execute(stmt).all()
    ]
