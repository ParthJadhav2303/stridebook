from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

DUE_STATUSES = ("unpaid", "partial", "paid", "waived")
PAYMENT_MODES = ("cash", "upi")


class FeeDue(Base):
    """What one student owes for one month. amount_paid is kept in sync by the payments service."""

    __tablename__ = "fee_dues"
    __table_args__ = (
        UniqueConstraint("student_id", "period"),
        CheckConstraint("amount_paid >= 0"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    period: Mapped[date] = mapped_column(Date, index=True)  # first day of the month
    amount_due: Mapped[int] = mapped_column(Integer)
    amount_paid: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(10), default="unpaid", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def refresh_status(self) -> None:
        if self.status == "waived":
            return
        if self.amount_paid >= self.amount_due:
            self.status = "paid"
        elif self.amount_paid > 0:
            self.status = "partial"
        else:
            self.status = "unpaid"


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (CheckConstraint("amount > 0"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_no: Mapped[str] = mapped_column(String(20), unique=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    mode: Mapped[str] = mapped_column(String(10))
    paid_on: Mapped[date] = mapped_column(Date, index=True)
    note: Mapped[str | None] = mapped_column(Text)
    received_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    is_voided: Mapped[bool] = mapped_column(Boolean, default=False)  # voiding arrives in Phase 2
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    allocations: Mapped[list["PaymentAllocation"]] = relationship(back_populates="payment")


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"

    id: Mapped[int] = mapped_column(primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"), index=True)
    fee_due_id: Mapped[int] = mapped_column(ForeignKey("fee_dues.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)

    payment: Mapped[Payment] = relationship(back_populates="allocations")
    fee_due: Mapped[FeeDue] = relationship()
