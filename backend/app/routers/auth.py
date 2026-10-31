from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user, make_token, verify_password
from ..db import get_db
from ..errors import ApiError
from ..models import User
from ..schemas import DemoAccount, LoginIn, LoginOut, UserOut
from ..services import state

router = APIRouter(tags=["auth"])


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, name=u.name, role=u.role, department=u.department, faculty_id=u.faculty_id)


@router.post("/auth/login", response_model=LoginOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if u is None or not verify_password(body.password, u.password_hash):
        raise ApiError(401, "bad_credentials", "Wrong email or password")
    return LoginOut(token=make_token(u), user=user_out(u))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.get("/auth/demo-accounts", response_model=list[DemoAccount])
def demo_accounts(db: Session = Depends(get_db)):
    """The accounts the login page offers as one-click buttons (passwords are in the README)."""
    _, ds = state.active_dataset(db)
    return [DemoAccount(email=a["email"], role=a["role"], name=a["name"], description=a["description"])
            for a in state.demo_accounts(ds)]
