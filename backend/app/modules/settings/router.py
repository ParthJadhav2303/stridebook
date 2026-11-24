from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import require_admin
from app.models import AppSetting, User

router = APIRouter(prefix="/settings", tags=["settings"])


class PublicSettings(BaseModel):
    app_name: str
    club_name: str
    club_short: str


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    club_name: str | None = Field(default=None, min_length=2, max_length=80)
    club_short: str | None = Field(default=None, min_length=1, max_length=10)


def read_public(db: Session) -> PublicSettings:
    env = get_settings()
    stored = dict(db.execute(select(AppSetting.key, AppSetting.value)).tuples().all())
    return PublicSettings(
        app_name=env.app_name,
        club_name=stored.get("club_name", env.club_name),
        club_short=stored.get("club_short", env.club_short),
    )


@router.get("/public", response_model=PublicSettings)
def public_settings(db: Session = Depends(get_db)) -> PublicSettings:
    """Branding shown before login. Values saved by an admin win over env defaults."""
    return read_public(db)


@router.patch("", response_model=PublicSettings)
def update_settings(body: SettingsUpdate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    for key, value in body.model_dump(exclude_none=True).items():
        row = db.get(AppSetting, key)
        if row:
            row.value = value
        else:
            db.add(AppSetting(key=key, value=value))
    db.commit()
    return read_public(db)
