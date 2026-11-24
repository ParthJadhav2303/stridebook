from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_token
from app.models import User

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)
) -> User:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Please sign in again.", headers={"WWW-Authenticate": "Bearer"}
    )
    if creds is None:
        raise unauthorized
    decoded = decode_token(creds.credentials, "access")
    if decoded is None:
        raise unauthorized
    user = db.get(User, decoded[0])
    if user is None or not user.is_active or user.token_version != decoded[1]:
        raise unauthorized
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an admin can do this.")
    return user
