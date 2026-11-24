from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.fee import FeeGroup

STUDENT_STATUSES = ("active", "paused", "left")


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(100), index=True)
    parent_name: Mapped[str | None] = mapped_column(String(100))
    parent_phone: Mapped[str | None] = mapped_column(String(20))
    alt_phone: Mapped[str | None] = mapped_column(String(20))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    fee_group_id: Mapped[int] = mapped_column(ForeignKey("fee_groups.id"))
    joining_date: Mapped[date] = mapped_column(Date)
    leaving_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="active", index=True)
    custom_monthly_fee: Mapped[int | None] = mapped_column(Integer)  # overrides the group fee
    notes: Mapped[str | None] = mapped_column(Text)
    legacy_ref: Mapped[str | None] = mapped_column(String(50))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    fee_group: Mapped[FeeGroup] = relationship()
