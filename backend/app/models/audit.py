from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AuditLog(Base):
    """Who did what, in plain words. Never edited or deleted by the app."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(40), index=True)  # e.g. payment.create
    entity: Mapped[str] = mapped_column(String(30))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(Text)  # human sentence shown in the Activity screen
    details: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
