"""JWT login and role guards. Two kinds of account: the seeded demo accounts (one shared password, for
judges) and people's own accounts made with POST /auth/signup (services/accounts.py)."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .errors import ApiError, forbidden
from .models import User

TOKEN_HOURS = 12
# every demo account, and only those, has an address on this domain (.demo is not a real TLD, so sign-up can
# refuse it and nobody's own account can be mistaken for one)
DEMO_DOMAIN = "@cit.demo"

# app roles -> the role names the dataset uses for booking requests (role_category_cap keys)
DATASET_ROLE = {"admin": "admin", "coordinator": "department_coordinator", "faculty": "faculty", "club": "club"}


def is_demo(user: User) -> bool:
    return user.email.endswith(DEMO_DOMAIN)


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


# a security scheme (not a plain header) so /api/docs shows an Authorize button for the login token
bearer = HTTPBearer(auto_error=False, description="Paste the token from POST /api/auth/login")


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if creds is None:
        raise ApiError(401, "unauthenticated", "Log in first")
    try:
        claims = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise ApiError(401, "unauthenticated", "Your session has expired, log in again")
    user = db.get(User, int(claims["sub"]))
    if user is None:          # a demo account the newly loaded dataset doesn't have any more
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
