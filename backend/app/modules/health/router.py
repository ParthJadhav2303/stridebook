from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    """Used by Docker healthcheck, uptime monitor and the frontend status card."""
    settings = get_settings()
    body = {"status": "ok", "version": settings.app_version, "db": "ok"}
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        body.update(status="degraded", db="unreachable")
        return JSONResponse(body, status_code=503)
    return body
