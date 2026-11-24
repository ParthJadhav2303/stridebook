import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

StudentStatus = Literal["active", "paused", "left"]
DueStatus = Literal["unpaid", "partial", "paid", "waived"]


def _clean_phone(v: str | None) -> str | None:
    if v is None or not v.strip():
        return None
    digits = re.sub(r"[^\d+]", "", v)
    if len(re.sub(r"\D", "", digits)) < 10:
        raise ValueError("Phone number needs at least 10 digits.")
    return digits


class StudentBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    parent_name: str | None = Field(default=None, max_length=100)
    parent_phone: str | None = None
    alt_phone: str | None = None
    date_of_birth: date | None = None
    fee_group_id: int
    custom_monthly_fee: int | None = Field(default=None, ge=0, le=100000)
    notes: str | None = Field(default=None, max_length=2000)

    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("parent_phone", "alt_phone")
    @classmethod
    def phones(cls, v: str | None) -> str | None:
        return _clean_phone(v)


class StudentCreate(StudentBase):
    joining_date: date | None = None  # defaults to today


class StudentUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=100)
    parent_name: str | None = Field(default=None, max_length=100)
    parent_phone: str | None = None
    alt_phone: str | None = None
    date_of_birth: date | None = None
    fee_group_id: int | None = None
    custom_monthly_fee: int | None = Field(default=None, ge=0, le=100000)
    notes: str | None = Field(default=None, max_length=2000)
    joining_date: date | None = None
    status: StudentStatus | None = None
    leaving_date: date | None = None

    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("parent_phone", "alt_phone")
    @classmethod
    def phones(cls, v: str | None) -> str | None:
        return _clean_phone(v)


class StudentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    parent_name: str | None
    parent_phone: str | None
    alt_phone: str | None
    date_of_birth: date | None
    fee_group_id: int
    fee_group_name: str
    custom_monthly_fee: int | None
    monthly_fee: int | None
    joining_date: date
    leaving_date: date | None
    status: StudentStatus
    notes: str | None
    # For the month asked about (default: this month)
    month_status: DueStatus | None
    month_due: int | None
    month_paid: int | None
    # Everything still owed up to this month
    outstanding_amount: int
    outstanding_months: int


class LedgerMonth(BaseModel):
    period: date
    amount_due: int | None
    amount_paid: int | None
    status: DueStatus | None  # None = not charged (before joining / not tracked / future)


class Ledger(BaseModel):
    year: int
    months: list[LedgerMonth]
