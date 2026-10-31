"""Active dataset, timetable versions, settings, demo reset and the audit trail."""
import copy
import json
import re
from dataclasses import asdict

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import hash_password
from ..config import STARTER_DATASET, settings
from ..core.checker import check_timetable, soft_score
from ..core.dataset import load_dataset
from ..core.model import Assign, Dataset
from ..errors import ApiError
from ..models import (AuditLog, BookingRequest, ChangeProposal, DatasetRow, ExamSchedule, Setting,
                      TimetableVersion, User)
from ..solver.fest import Decision, FestResult

LAB_TYPE_OWNERS = {"lab_cs": ["CSE"], "lab_elec": ["ECE", "EE"], "lab_phy": ["PH"], "workshop": ["ME"],
                   "lab_civil": ["CE"]}

_ds_cache: dict[int, Dataset] = {}


# ---------------------------------------------------------------- audit
def audit(db: Session, user: User | None, action: str, entity: str, payload: dict | None = None) -> None:
    db.add(AuditLog(actor=user.id if user else None, action=action, entity=entity, payload=payload or {}))


# ---------------------------------------------------------------- dataset
def active_dataset_row(db: Session) -> DatasetRow:
    row = db.scalar(select(DatasetRow).where(DatasetRow.active.is_(True)).order_by(DatasetRow.id.desc()))
    if row is None:
        raise ApiError(409, "no_dataset", "No dataset is loaded. An admin can load one on the Data page.")
    return row


def dataset_of(db: Session, row: DatasetRow) -> Dataset:
    """Parsed dataset for a stored row, with the admin's priority order applied."""
    ds = _ds_cache.get(row.id)
    if ds is None:
        ds = load_dataset(copy.deepcopy(row.data))
        if len(_ds_cache) > 8:
            _ds_cache.clear()
        _ds_cache[row.id] = ds
    order = get_settings(db, ds)["priority_order"]
    if sorted(order) == sorted(ds.raw["priority_order"]):
        ds.priority_order = list(order)
    return ds


def active_dataset(db: Session) -> tuple[DatasetRow, Dataset]:
    row = active_dataset_row(db)
    return row, dataset_of(db, row)


def store_dataset(db: Session, ds: Dataset, user: User | None, parent: DatasetRow | None = None,
                  change: dict | None = None) -> DatasetRow:
    for old in db.scalars(select(DatasetRow).where(DatasetRow.active.is_(True))):
        old.active = False
    changes = (list(parent.applied_changes) if parent else []) + ([change] if change else [])
    row = DatasetRow(dataset_id=ds.dataset_id, data=ds.raw, applied_changes=changes,
                     parent_id=parent.id if parent else None, active=True)
    db.add(row)
    db.flush()
    _ds_cache[row.id] = ds
    audit(db, user, "dataset.load" if change is None else "dataset.change", f"dataset:{row.id}",
          {"dataset_id": ds.dataset_id, "changes": len(changes)})
    return row


# ---------------------------------------------------------------- versions
def to_assign(raw: dict) -> Assign:
    return {sid: (v[0], int(v[1]), v[2]) for sid, v in raw.items()}


def from_assign(assign: Assign) -> dict:
    return {sid: [d, p, r] for sid, (d, p, r) in sorted(assign.items())}


def active_version(db: Session, row: DatasetRow | None = None) -> TimetableVersion | None:
    q = select(TimetableVersion).where(TimetableVersion.status == "active")
    if row is not None:
        q = q.where(TimetableVersion.dataset_fk == row.id)
    return db.scalar(q.order_by(TimetableVersion.id.desc()))


def require_version(db: Session, row: DatasetRow) -> TimetableVersion:
    v = active_version(db, row)
    if v is None:
        raise ApiError(409, "no_timetable", "No timetable yet. An admin can generate one on the Data page.")
    return v


def save_version(db: Session, ds: Dataset, row: DatasetRow, assign: Assign, kind: str, user: User | None,
                 parent: TimetableVersion | None = None, fest: FestResult | None = None,
                 solver_status: str | None = None, solve_ms: int | None = None, note: str | None = None) -> TimetableVersion:
    """Make `assign` the active timetable. Refuses anything that fails the hard-rule check."""
    viol = check_timetable(ds, assign)
    if viol:
        raise ApiError(422, "hard_violations", f"Not saved: {len(viol)} hard rule violation(s)",
                       {"violations": [asdict(v) for v in viol[:50]]})
    for old in db.scalars(select(TimetableVersion).where(TimetableVersion.status == "active")):
        old.status = "archived"
    soft, total = soft_score(ds, assign)
    v = TimetableVersion(dataset_fk=row.id, parent_id=parent.id if parent else None, kind=kind, status="active",
                         assignments=from_assign(assign), fest=fest_to_json(fest) if fest else None,
                         soft=soft, soft_total=total, hard_count=0, solver_status=solver_status,
                         solve_ms=solve_ms, note=note, created_by=user.id if user else None)
    db.add(v)
    db.flush()
    audit(db, user, f"timetable.{kind}", f"version:{v.id}", {"soft_total": total, "parent": v.parent_id})
    return v


def fest_to_json(f: FestResult) -> dict:
    return {"decisions": [asdict(d) for d in f.decisions], "overrides": list(f.overrides)}


def fest_from(raw: dict | None) -> FestResult | None:
    if not raw:
        return None
    return FestResult([Decision(**d) for d in raw["decisions"]], list(raw["overrides"]))


def fest_of(v: TimetableVersion | None) -> FestResult | None:
    return fest_from(v.fest) if v is not None else None


def latest_exams(db: Session, row: DatasetRow) -> ExamSchedule | None:
    """Exam timetable for this dataset. Change files don't touch exams, so after a change the
    schedule made for the data before it still holds."""
    while row is not None:
        ex = db.scalar(select(ExamSchedule).where(ExamSchedule.dataset_fk == row.id).order_by(ExamSchedule.id.desc()))
        if ex is not None:
            return ex
        row = db.get(DatasetRow, row.parent_id) if row.parent_id else None
    return None


# ---------------------------------------------------------------- settings
def default_settings(ds: Dataset) -> dict:
    depts = {f["department"] for f in ds.faculty.values()} | {g.get("department") for g in ds.groups.values()}
    owners = {}
    for r in ds.rooms.values():
        own = [d for d in LAB_TYPE_OWNERS.get(r["type"], []) if d in depts]
        if own:
            owners[r["id"]] = own
    return {"priority_order": list(ds.raw["priority_order"]), "lab_owners": owners}


def get_settings(db: Session, ds: Dataset) -> dict:
    out = default_settings(ds)
    for s in db.scalars(select(Setting)):
        if s.key in out:
            out[s.key] = s.value
    return out


def put_settings(db: Session, ds: Dataset, values: dict, user: User) -> dict:
    for key, val in values.items():
        row = db.get(Setting, key)
        if row is None:
            db.add(Setting(key=key, value=val))
        else:
            row.value = val
    audit(db, user, "settings.update", "settings", values)
    db.flush()
    return get_settings(db, ds)


# ---------------------------------------------------------------- demo accounts and reset
def demo_accounts(ds: Dataset) -> list[dict]:
    """Accounts the login page offers, derived from the loaded dataset: the Admin, one coordinator per
    department, one account per faculty member and one per club that makes venue requests."""
    depts = []
    for d in [g.get("department") for g in ds.groups.values()] + [f["department"] for f in ds.faculty.values()]:
        if d and d not in ("COMMON", "ADMIN") and d not in depts:
            depts.append(d)
    out = [{"email": "admin@cit.demo", "name": "Dean's Office", "role": "admin", "department": None,
            "faculty_id": None, "description": "Generates timetables, approves changes, decides Spectra week"}]
    for d in depts:
        out.append({"email": f"{d.lower()}.coord@cit.demo", "name": f"{d} Coordinator",
                    "role": "coordinator", "department": d, "faculty_id": None,
                    "description": f"Books rooms for {d} events, approves bookings of {d} labs"})
    for f in ds.faculty.values():
        out.append({"email": f"{f['id'].lower()}@cit.demo", "name": f["name"], "role": "faculty",
                    "department": f["department"], "faculty_id": f["id"],
                    "description": f"Sees {f['id']}'s timetable, marks leave, asks for changes"})
    clubs = sorted({r["requester"] for r in ds.requests.values() if r.get("role") == "club" and r.get("requester")})
    for name in clubs or ["Student Club"]:
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        out.append({"email": f"{slug}@cit.demo" if clubs else "club@cit.demo", "name": name, "role": "club",
                    "department": None, "faculty_id": None, "description": "Submits and cancels venue requests"})
    return out


def upsert_demo_users(db: Session, ds: Dataset, reset_passwords: bool = False) -> None:
    """Create the demo accounts, or re-point existing ones at the loaded dataset (same email, same id,
    so logged-in sessions survive a reset or a dataset upload)."""
    pw = None
    accounts = demo_accounts(ds)
    for a in accounts:
        u = db.scalar(select(User).where(User.email == a["email"]))
        if u is None or reset_passwords:
            pw = pw or hash_password(settings.demo_password)
        if u is None:
            u = User(email=a["email"], password_hash=pw)
            db.add(u)
        elif reset_passwords:
            u.password_hash = pw
        u.name, u.role, u.department, u.faculty_id = a["name"], a["role"], a["department"], a["faculty_id"]
    # accounts the dataset no longer has: delete them, unless they made bookings, proposals or other
    # history (the database won't drop a referenced row); those stay but leave the login page
    obsolete = list(db.scalars(select(User.id).where(User.email.not_in([a["email"] for a in accounts]))))
    if obsolete:
        used = set()
        for col in (TimetableVersion.created_by, BookingRequest.created_by, BookingRequest.decided_by,
                    ChangeProposal.requested_by, ChangeProposal.decided_by, AuditLog.actor):
            used |= set(db.scalars(select(col).where(col.in_(obsolete))))
        if gone := [i for i in obsolete if i not in used]:
            db.execute(delete(User).where(User.id.in_(gone)))
    db.flush()


def clear_runtime(db: Session, keep_audit: bool = False) -> None:
    tables = [ChangeProposal, BookingRequest, ExamSchedule, TimetableVersion, DatasetRow, Setting]
    for table in ([] if keep_audit else [AuditLog]) + tables:
        db.execute(delete(table))
    _ds_cache.clear()


def load_new_dataset(db: Session, ds: Dataset, user: User) -> DatasetRow:
    """Replace the dataset. Timetables, requests and proposals belong to the old data, so they go."""
    clear_runtime(db, keep_audit=True)
    upsert_demo_users(db, ds)
    return store_dataset(db, ds, user)


def reset_demo(db: Session) -> Dataset:
    """Back to a clean state: the starter dataset, no timetable, no requests, fresh demo accounts."""
    raw = json.loads(STARTER_DATASET.read_text(encoding="utf-8"))
    ds = load_dataset(raw)
    clear_runtime(db)
    upsert_demo_users(db, ds, reset_passwords=True)
    store_dataset(db, ds, None)
    audit(db, None, "demo.reset", "app", {"dataset_id": ds.dataset_id})
    db.commit()
    return ds


def ensure_seeded(db: Session) -> None:
    if db.scalar(select(User.id).limit(1)) is None or db.scalar(select(DatasetRow.id).limit(1)) is None:
        try:
            reset_demo(db)
        except IntegrityError:      # two fresh instances seeding at once: the other one won
            db.rollback()
        return
    # a database seeded by an older version may lack some demo accounts: add them, touch nothing else
    _, ds = active_dataset(db)
    have = set(db.scalars(select(User.email)))
    if any(a["email"] not in have for a in demo_accounts(ds)):
        try:
            upsert_demo_users(db, ds)
            db.commit()
        except IntegrityError:
            db.rollback()
