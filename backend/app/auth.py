"""JWT login and role guards. Demo accounts only: no sign-up, no password reset."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .errors import ApiError, forbidden
from .models import User

TOKEN_HOURS = 12

# app roles -> the role names the dataset uses for booking requests (role_category_cap keys)
DATASET_ROLE = {"admin": "admin", "coordinator": "department_coordinator", "faculty": "faculty", "club": "club"}


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def make_token(user: User) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    return jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp}, settings.jwt_secret, algorithm="HS256")


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "unauthenticated", "Log in first")
    try:
        claims = jwt.decode(authorization.split(" ", 1)[1], settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise ApiError(401, "unauthenticated", "Your session has expired, log in again")
    user = db.get(User, int(claims["sub"]))
    if user is None:          # demo data was reset and the account no longer exists
        raise ApiError(401, "unauthenticated", "Your session has expired, log in again")
    return user


def require_roles(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise forbidden(f"Only {' or '.join(roles)} accounts can do this")
        return user
    return dep


def require_not_owner(user: User, owner_id: int | None) -> None:
    if owner_id is not None and owner_id == user.id:
        raise forbidden("You can't approve or reject your own request")
