from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.models import AppSetting

router = APIRouter(prefix="/settings", tags=["settings"])


class PublicSettings(BaseModel):
    app_name: str
    club_name: str
    club_short: str


@router.get("/public", response_model=PublicSettings)
def public_settings(db: Session = Depends(get_db)) -> PublicSettings:
    """Branding shown before login. Values saved by an admin win over env defaults."""
    env = get_settings()
    stored = dict(db.execute(select(AppSetting.key, AppSetting.value)).tuples().all())
    return PublicSettings(
        app_name=env.app_name,
        club_name=stored.get("club_name", env.club_name),
        club_short=stored.get("club_short", env.club_short),
    )
