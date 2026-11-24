from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class FeeGroup(Base):
    """e.g. Big group / Small group. The monthly amount lives in FeeGroupRate so it can change over time."""

    __tablename__ = "fee_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    rates: Mapped[list["FeeGroupRate"]] = relationship(
        back_populates="fee_group", order_by="FeeGroupRate.effective_from.desc()"
    )


class FeeGroupRate(Base):
    __tablename__ = "fee_group_rates"
    __table_args__ = (UniqueConstraint("fee_group_id", "effective_from"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    fee_group_id: Mapped[int] = mapped_column(ForeignKey("fee_groups.id"))
    monthly_amount: Mapped[int] = mapped_column(Integer)  # whole rupees
    effective_from: Mapped[date] = mapped_column(Date)  # first day of a month
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    fee_group: Mapped[FeeGroup] = relationship(back_populates="rates")
