from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["admin", "coach"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    role: Role
    is_active: bool


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9._-]+$")
    full_name: str = Field(min_length=1, max_length=100)
    role: Role = "coach"
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def lower(cls, v: str) -> str:
        return v.strip().lower()


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=100)
    role: Role | None = None
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=128)
