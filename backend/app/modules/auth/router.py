import threading
import time

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.security import create_token, decode_token, hash_password, verify_password
from app.models import User
from app.modules.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory lockout is fine for a single API process with three users.
_failures: dict[str, list[float]] = {}
_lock = threading.Lock()


def _locked_out(username: str) -> bool:
    s = get_settings()
    window = s.login_lockout_minutes * 60
    with _lock:
        recent = [t for t in _failures.get(username, []) if time.time() - t < window]
        _failures[username] = recent
        return len(recent) >= s.login_max_failures


def _record_failure(username: str) -> None:
    with _lock:
        _failures.setdefault(username, []).append(time.time())


def reset_lockouts() -> None:
    with _lock:
        _failures.clear()


class LoginIn(BaseModel):
    username: str
    password: str


class TokensOut(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut


class RefreshIn(BaseModel):
    refresh_token: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


def _tokens(user: User) -> TokensOut:
    return TokensOut(
        access_token=create_token(user.id, "access", user.token_version),
        refresh_token=create_token(user.id, "refresh", user.token_version),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokensOut)
def login(body: LoginIn, db: Session = Depends(get_db)) -> TokensOut:
    username = body.username.strip().lower()
    if _locked_out(username):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many wrong passwords. Try again in {get_settings().login_lockout_minutes} minutes.",
        )
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not user.is_active or not verify_password(user.password_hash, body.password):
        _record_failure(username)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password.")
    return _tokens(user)


@router.post("/refresh", response_model=TokensOut)
def refresh(body: RefreshIn, db: Session = Depends(get_db)) -> TokensOut:
    decoded = decode_token(body.refresh_token, "refresh")
    user = db.get(User, decoded[0]) if decoded else None
    if user is None or not user.is_active or user.token_version != decoded[1]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in again.")
    return _tokens(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/change-password", response_model=TokensOut)
def change_password(
    body: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> TokensOut:
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is wrong.")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1  # signs out other devices
    db.commit()
    return _tokens(user)
