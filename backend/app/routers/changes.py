from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..auth import current_user, require_roles
from ..db import get_db
from ..errors import bad_request, forbidden, not_found
from ..models import User
from ..schemas import ChangeIntent, DecideIn, ProposalOut, UnavailabilityIn
from ..services import proposals, state
from .data import read_json_upload
from .timetable import course_dept

router = APIRouter(tags=["changes"])


def _ctx(db: Session):
    row, ds = state.active_dataset(db)
    return row, ds, state.require_version(db, row)


def _describe(change_file: dict) -> str:
    kinds = [c.get("type", "?").replace("_", " ") for c in change_file.get("changes", [])]
    head = change_file.get("description") or change_file.get("id")
    return head[:180] if head else f"{len(kinds)} change(s): {', '.join(sorted(set(kinds)))}"


@router.post("/changes/file", response_model=ProposalOut)
async def change_file(request: Request, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    """Upload a change file in the starter-pack format. Returns the repair proposal; nothing is applied
    until it is approved."""
    data = await read_json_upload(request)
    row, ds, v = _ctx(db)
    p = proposals.from_changes(db, row, ds, v, data, "file", _describe(data), user)
    db.commit()
    return proposals.to_out(db, p, user)


def _intent_to_changes(ds, intent: ChangeIntent, user: User) -> dict:
    t = intent.type
    if t == "faculty_unavailable":
        fid = intent.faculty_id or user.faculty_id
        if not fid or fid not in ds.faculty:
            raise bad_request("Say which faculty member is unavailable")
        if user.role == "faculty" and fid != user.faculty_id:
            raise forbidden("You can only mark your own unavailability")
        if not intent.days or not intent.periods:
            raise bad_request("Say which days and periods")
        return {"changes": [{"type": t, "faculty_id": fid, "days": intent.days, "periods": intent.periods,
                             "reason": intent.reason or "Requested in the app"}]}
    if t == "remove_session":
        if intent.session_id not in ds.sessions:
            raise not_found(f"No session {intent.session_id}")
        return {"changes": [{"type": t, "session_id": intent.session_id}]}
    if t == "add_session":
        if not intent.session:
            raise bad_request("Give the session to add")
        return {"changes": [{"type": t, "session": intent.session}]}
    raise bad_request(f"Unsupported change type {t}")


@router.post("/changes", response_model=ProposalOut)
def request_change(intent: ChangeIntent, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("admin", "coordinator", "faculty"))):
    """A change asked for in the app (from the assistant or a form). Faculty may change only their own
    sessions, coordinators only their department's."""
    row, ds, v = _ctx(db)
    sid = intent.session_id or (intent.session or {}).get("id")
    if intent.type in ("move_session", "remove_session", "add_session") and user.role != "admin":
        s = ds.sessions.get(intent.session_id) if intent.type != "add_session" else intent.session
        if not s:
            raise not_found(f"No session {sid}")
        if user.role == "faculty" and s.get("faculty_id") != user.faculty_id:
            raise forbidden("You can only change your own sessions")
        if user.role == "coordinator":
            dept = course_dept(ds, intent.session_id) if intent.type != "add_session" else \
                ds.faculty.get(s.get("faculty_id"), {}).get("department")
            if dept != user.department:
                raise forbidden(f"Coordinators can only change {user.department} sessions")
    if intent.type == "move_session":
        if not intent.session_id or not intent.target:
            raise bad_request("Say which session to move and where to")
        tgt = intent.target
        p = proposals.from_move(db, row, ds, v, intent.session_id, tgt.day, tgt.start, tgt.room, "request",
                                f"Move {intent.session_id} to {tgt.day} P{tgt.start} {tgt.room}", user, intent.reason)
    else:
        cf = _intent_to_changes(ds, intent, user)
        title = {"faculty_unavailable": f"{cf['changes'][0].get('faculty_id')} unavailable",
                 "remove_session": f"Remove {sid}", "add_session": f"Add {sid}"}[intent.type]
        p = proposals.from_changes(db, row, ds, v, cf, "request", title + (f": {intent.reason}" if intent.reason else ""), user)
    db.commit()
    return proposals.to_out(db, p, user)


@router.post("/faculty/unavailability", response_model=ProposalOut)
def unavailability(body: UnavailabilityIn, db: Session = Depends(get_db), user: User = Depends(require_roles("faculty"))):
    row, ds, v = _ctx(db)
    bad = [d for d in body.days if d not in ds.days] + [str(p) for p in body.periods if not 1 <= p <= 9]
    if bad:
        raise bad_request(f"Not a teaching day or period: {', '.join(bad)}")
    cf = {"changes": [{"type": "faculty_unavailable", "faculty_id": user.faculty_id, "days": body.days,
                       "periods": sorted(set(body.periods)), "reason": body.reason or "Marked in the app"}]}
    title = f"{user.faculty_id} unavailable {', '.join(body.days)} P{min(body.periods)}–P{max(body.periods)}"
    p = proposals.from_changes(db, row, ds, v, cf, "unavailability", title, user)
    db.commit()
    return proposals.to_out(db, p, user)


@router.get("/changes", response_model=list[ProposalOut])
def list_changes(status: str | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return [proposals.to_out(db, p, user) for p in proposals.visible(db, user, status)]


@router.get("/changes/{pid}", response_model=ProposalOut)
def get_change(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = proposals.get(db, pid)
    if user.role != "admin" and p.requested_by != user.id:
        raise forbidden("You can only see your own requests")
    return proposals.to_out(db, p, user)


@router.post("/changes/{pid}/approve", response_model=ProposalOut)
def approve(pid: int, body: DecideIn | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = proposals.get(db, pid)
    proposals.approve(db, p, user, body.note if body else "")
    db.commit()
    return proposals.to_out(db, p, user)


@router.post("/changes/{pid}/reject", response_model=ProposalOut)
def reject(pid: int, body: DecideIn | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = proposals.get(db, pid)
    proposals.reject(db, p, user, body.note if body else "")
    db.commit()
    return proposals.to_out(db, p, user)
