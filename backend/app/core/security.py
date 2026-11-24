from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings

_hasher = PasswordHasher()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def create_token(user_id: int, kind: str, token_version: int) -> str:
    s = get_settings()
    lifetime = (
        timedelta(minutes=s.access_token_minutes)
        if kind == "access"
        else timedelta(days=s.refresh_token_days)
    )
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "type": kind, "ver": token_version, "iat": now, "exp": now + lifetime}
    return jwt.encode(payload, s.secret_key, algorithm=ALGORITHM)


def decode_token(token: str, kind: str) -> tuple[int, int] | None:
    """Returns (user_id, token_version), or None if the token is invalid, expired or the wrong kind."""
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != kind:
        return None
    return int(payload["sub"]), int(payload.get("ver", 0))
