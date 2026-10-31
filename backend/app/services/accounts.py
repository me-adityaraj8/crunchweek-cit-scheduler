"""People's own accounts: sign-up, password changes and the Admin's role changes. Demo accounts follow the
loaded dataset (state.upsert_demo_users) and are never changed here."""
import re

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import DEMO_DOMAIN, hash_password, is_demo, verify_password
from ..errors import ApiError, bad_request, conflict, forbidden, not_found
from ..models import User
from . import state

MIN_PASSWORD = 8
BCRYPT_MAX_BYTES = 72        # bcrypt 5 refuses longer passwords instead of cutting them short
_EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
_TAKEN = "An account with this email already exists. Log in instead."


def clean_email(raw: str) -> str:
    email = raw.strip().lower()
    if not _EMAIL.fullmatch(email) or len(email) > 120:
        raise bad_request("Enter a valid email address")
    if email.endswith(DEMO_DOMAIN):
        raise bad_request(f"Addresses ending in {DEMO_DOMAIN} are kept for the demo accounts")
    return email


def clean_name(raw: str) -> str:
    name = " ".join(raw.split())
    if not 2 <= len(name) <= 120:
        raise bad_request("Enter a name between 2 and 120 characters")
    return name


def check_password(pw: str) -> None:
    if len(pw) < MIN_PASSWORD:
        raise bad_request(f"Use at least {MIN_PASSWORD} characters for the password")
    if len(pw.encode()) > BCRYPT_MAX_BYTES:
        raise bad_request(f"Use a password of at most {BCRYPT_MAX_BYTES} bytes")


def link(db: Session, role: str, department: str | None, faculty_id: str | None,
         user_id: int | None = None) -> tuple[str | None, str | None]:
    """(department, faculty_id) for an account with this role, checked against the loaded dataset.
    Each faculty member can have one own account; the demo faculty account doesn't count."""
    _, ds = state.active_dataset(db)
    if role == "faculty":
        f = ds.faculty.get(faculty_id or "")
        if f is None:
            raise bad_request("Pick which faculty member you are")
        q = select(User.id).where(User.role == "faculty", User.faculty_id == f["id"], ~User.email.endswith(DEMO_DOMAIN))
        if user_id is not None:
            q = q.where(User.id != user_id)
        if db.scalar(q.limit(1)) is not None:
            raise conflict(f"{f['name']} ({f['id']}) already has an account. Ask the Admin if that isn't right.")
        return f["department"], f["id"]
    if role == "coordinator":
        depts = state.teaching_departments(ds)
        if department not in depts:
            raise bad_request(f"Pick the department this coordinator is for: {', '.join(depts)}")
        return department, None
    return None, None


def signup(db: Session, name: str, email: str, password: str, role: str, faculty_id: str | None) -> User:
    email, name = clean_email(email), clean_name(name)
    check_password(password)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise conflict(_TAKEN)
    department, faculty_id = link(db, role, None, faculty_id)
    u = User(email=email, name=name, role=role, department=department, faculty_id=faculty_id,
             password_hash=hash_password(password))
    db.add(u)
    try:
        db.flush()
    except IntegrityError:      # the same address signed up twice at the same moment
        db.rollback()
        raise conflict(_TAKEN)
    state.audit(db, u, "account.signup", f"user:{u.id}", {"role": role, "faculty_id": faculty_id})
    return u


def change_password(db: Session, user: User, current: str, new: str) -> None:
    if is_demo(user):
        raise forbidden("Demo accounts share one password, so it can't be changed")
    if not verify_password(current, user.password_hash):
        # 400, not 401: a 401 would end the session of someone who only mistyped
        raise ApiError(400, "bad_credentials", "Your current password is wrong")
    check_password(new)
    user.password_hash = hash_password(new)
    state.audit(db, user, "account.password", f"user:{user.id}")


def accounts(db: Session) -> list[User]:
    """People's own accounts, newest first, then the demo accounts."""
    return sorted(db.scalars(select(User)), key=lambda u: (is_demo(u), -u.id))


def set_role(db: Session, admin: User, user_id: int, role: str, department: str | None,
             faculty_id: str | None) -> User:
    u = db.get(User, user_id)
    if u is None:
        raise not_found(f"No account with id {user_id}")
    if is_demo(u):
        raise conflict("Demo accounts follow the loaded dataset, so they can't be changed here")
    if u.id == admin.id:
        raise forbidden("You can't change your own role. Ask another Admin.")
    before = {"role": u.role, "department": u.department, "faculty_id": u.faculty_id}
    u.department, u.faculty_id = link(db, role, department, faculty_id, user_id=u.id)
    u.role = role
    state.audit(db, admin, "account.role", f"user:{u.id}",
                {"before": before, "after": {"role": role, "department": u.department, "faculty_id": u.faculty_id}})
    return u
