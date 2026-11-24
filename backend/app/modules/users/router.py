from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_admin
from app.core.security import hash_password
from app.models import User
from app.modules.users.schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.is_active.desc(), User.full_name)).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Username '{body.username}' is already taken.")
    user = User(
        username=body.username,
        full_name=body.full_name.strip(),
        role=body.role,
        password_hash=hash_password(body.password),
        is_active=True,
        token_version=0,
    )
    db.add(user)
    db.commit()
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int, body: UserUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")

    removing_admin = (body.role == "coach" or body.is_active is False) and user.role == "admin"
    if removing_admin:
        admins = db.scalar(select(func.count()).where(User.role == "admin", User.is_active.is_(True)))
        if admins <= 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The app needs at least one active admin.")

    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
        if not body.is_active:
            user.token_version += 1
    if body.new_password:
        user.password_hash = hash_password(body.new_password)
        user.token_version += 1
    db.commit()
    return user
