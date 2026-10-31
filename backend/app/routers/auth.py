from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user, is_demo, make_token, require_roles, verify_password
from ..db import get_db
from ..errors import ApiError
from ..models import User
from ..schemas import (DemoAccount, FacultyChoice, LoginIn, LoginOut, PasswordIn, RoleIn, SignupIn, SignupOptions,
                       UserOut)
from ..services import accounts, state

router = APIRouter(tags=["auth"])


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, name=u.name, role=u.role, department=u.department,
                   faculty_id=u.faculty_id, demo=is_demo(u))


@router.post("/auth/login", response_model=LoginOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if u is None or not verify_password(body.password, u.password_hash):
        raise ApiError(401, "bad_credentials", "Wrong email or password")
    return LoginOut(token=make_token(u), user=user_out(u))


@router.post("/auth/signup", response_model=LoginOut)
def signup(body: SignupIn, db: Session = Depends(get_db)):
    """Make your own account (club representative or faculty) and log straight in."""
    u = accounts.signup(db, body.name, body.email, body.password, body.role, body.faculty_id)
    db.commit()
    return LoginOut(token=make_token(u), user=user_out(u))


@router.get("/auth/signup-options", response_model=SignupOptions)
def signup_options(db: Session = Depends(get_db)):
    """What the sign-up form offers: the faculty members of the loaded dataset."""
    _, ds = state.active_dataset(db)
    return SignupOptions(faculty=[FacultyChoice(id=f["id"], name=f["name"], department=f["department"])
                                  for f in ds.faculty.values()])


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.post("/auth/password")
def change_password(body: PasswordIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    accounts.change_password(db, user, body.current_password, body.new_password)
    db.commit()
    return {"ok": True}


@router.get("/auth/demo-accounts", response_model=list[DemoAccount])
def demo_accounts(db: Session = Depends(get_db)):
    """The accounts the login page offers as one-click buttons (passwords are in the README)."""
    _, ds = state.active_dataset(db)
    return [DemoAccount(email=a["email"], role=a["role"], name=a["name"], description=a["description"],
                        department=a["department"])
            for a in state.demo_accounts(ds)]


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    """Every account: people's own (newest first), then the demo accounts."""
    return [user_out(u) for u in accounts.accounts(db)]


@router.put("/users/{user_id}", response_model=UserOut)
def set_role(user_id: int, body: RoleIn, db: Session = Depends(get_db),
             admin: User = Depends(require_roles("admin"))):
    """Give someone's own account a role. Only an Admin can make coordinators and admins."""
    u = accounts.set_role(db, admin, user_id, body.role, body.department, body.faculty_id)
    db.commit()
    return user_out(u)
