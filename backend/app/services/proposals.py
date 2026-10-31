"""Timetable change proposals: change files, faculty requests, leave and manual moves.

A proposal is computed by the repair solver (or the checker, for a single manual move) and saved as
`pending` or `infeasible`. Nothing changes until an Admin approves it, and approving re-checks it
against the timetable that is active at that moment."""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..core.checker import check_move, check_timetable, soft_score
from ..core.dataset import apply_changes
from ..core.explain import explain_session
from ..core.model import Dataset
from ..errors import ApiError, bad_request, conflict, forbidden, not_found
from ..models import ChangeProposal, DatasetRow, TimetableVersion, User
from ..solver.fest import decide_fest
from ..solver.repair import _booking_changes, repair
from . import bookings, state

REQUEST_KINDS = ("request", "unavailability")      # made by someone else for the Admin to approve


def _slot(v) -> dict | None:
    return {"day": v[0], "start": int(v[1]), "room": v[2]} if v else None


def _diff(ds_before: Dataset, ds_after: Dataset, before: dict, after: dict) -> list[dict]:
    out = []
    for sid in sorted(set(before) | set(after)):
        b, a = before.get(sid), after.get(sid)
        if b is not None and a is not None and tuple(b) == tuple(a):
            continue
        s = ds_after.sessions.get(sid) or ds_before.sessions.get(sid) or {}
        out.append({"session_id": sid, "course_id": s.get("course_id"), "kind": s.get("kind"),
                    "groups": s.get("groups", []), "before": _slot(b), "after": _slot(a)})
    return out


def _counts(diff: list[dict]) -> dict:
    moved = [m for m in diff if m["before"] and m["after"]]
    return {"moved": len(moved),
            "time_changed": sum(1 for m in moved if (m["before"]["day"], m["before"]["start"]) !=
                                (m["after"]["day"], m["after"]["start"])),
            "room_only": sum(1 for m in moved if (m["before"]["day"], m["before"]["start"]) ==
                             (m["after"]["day"], m["after"]["start"])),
            "added": sum(1 for m in diff if not m["before"]),
            "removed": sum(1 for m in diff if not m["after"])}


def _repair(db: Session, ds: Dataset, version: TimetableVersion, change_file: dict):
    ds2 = apply_changes(ds, change_file)                 # DatasetError -> 400 naming the problem
    base = state.to_assign(version.assignments)
    r = repair(ds2, base, state.fest_of(version), settings.solver_time_limit_s, extra_requests=bookings.extras(db))
    return ds2, r


def dry_run(db: Session, ds: Dataset, version: TimetableVersion, change_file: dict) -> dict:
    """What a change would do to the timetable, computed by the same repair and checker as a real proposal,
    without saving anything."""
    if not isinstance(change_file, dict) or not isinstance(change_file.get("changes"), list) or not change_file["changes"]:
        raise bad_request('A change file needs a non-empty "changes" list')
    ds2, r = _repair(db, ds, version, change_file)
    out = {"status": "infeasible", "conflicts": [{"code": c.code, "text": c.text} for c in r.conflicts],
           "soft_before": r.soft_before, "diff": [], "moved": 0, "time_changed": 0, "room_only": 0, "added": 0,
           "removed": 0, "soft_after": None, "proven_minimal": False}
    if r.status == "ok" and r.assign is not None and not check_timetable(ds2, r.assign):
        diff = _diff(ds, ds2, version.assignments, state.from_assign(r.assign))
        out.update(status="feasible", diff=diff, soft_after=r.soft_after, proven_minimal=r.proven_minimal,
                   **_counts(diff))
    return out


def from_changes(db: Session, row: DatasetRow, ds: Dataset, version: TimetableVersion, change_file: dict,
                 kind: str, title: str, user: User) -> ChangeProposal:
    if not isinstance(change_file, dict) or not isinstance(change_file.get("changes"), list) or not change_file["changes"]:
        raise bad_request('A change file needs a non-empty "changes" list')
    ds2, r = _repair(db, ds, version, change_file)
    p = ChangeProposal(kind=kind, title=title, payload=change_file, base_version=version.id,
                       requested_by=user.id, soft_before=r.soft_before,
                       conflicts=[{"code": c.code, "text": c.text} for c in r.conflicts])
    if r.status == "ok" and r.assign is not None and not check_timetable(ds2, r.assign):
        p.status, p.proposed = "pending", state.from_assign(r.assign)
        p.fest = state.fest_to_json(r.fest) if r.fest else None
        p.diff = _diff(ds, ds2, version.assignments, p.proposed)
        for k, v in _counts(p.diff).items():
            setattr(p, k, v)
        p.soft_after, p.proven_minimal = r.soft_after, r.proven_minimal
    else:
        p.status = "infeasible"
        if r.status == "ok":       # never reached in tests; a last guard so a bad fix is never offered
            p.conflicts = p.conflicts + [{"code": "internal", "text": "The proposed fix failed the final check"}]
    db.add(p)
    db.flush()
    state.audit(db, user, f"change.{kind}", f"proposal:{p.id}", {"status": p.status, "moved": p.moved})
    return p


def suggestions(ds: Dataset, assign, sid: str, limit: int = 5) -> list[dict]:
    """Valid slots for a session right now, cheapest in soft penalty first (same day preferred)."""
    if sid not in assign:
        return []
    ex = explain_session(ds, assign, sid)
    day = assign[sid][0]
    ok = [a for a in ex["alternatives"] if not a["blocked_by"] and a["room"]]
    ok.sort(key=lambda a: (a["soft_delta"], a["day"] != day, ds.days.index(a["day"]), a["start"]))
    return [{"day": a["day"], "start": a["start"], "room": a["room"]} for a in ok[:limit]]


def check_manual(ds: Dataset, version: TimetableVersion, sid: str, day: str, start: int, room: str):
    if sid not in ds.sessions:
        raise not_found(f"No session {sid}")
    assign = state.to_assign(version.assignments)
    return assign, check_move(ds, assign, sid, day, start, room)


def from_move(db: Session, row: DatasetRow, ds: Dataset, version: TimetableVersion, sid: str, day: str,
              start: int, room: str, kind: str, title: str, user: User, reason: str = "") -> ChangeProposal:
    assign, viol = check_manual(ds, version, sid, day, start, room)
    payload = {"move": {"session_id": sid, "day": day, "start_period": start, "room_id": room}, "reason": reason}
    p = ChangeProposal(kind=kind, title=title, payload=payload, base_version=version.id, requested_by=user.id,
                       soft_before=version.soft_total)
    if viol:
        p.status = "infeasible"
        p.conflicts = [{"code": v.rule, "text": v.detail} for v in viol]
        p.alternatives = suggestions(ds, assign, sid)
    else:
        new = {**assign, sid: (day, start, room)}
        p.status, p.proposed = "pending", state.from_assign(new)
        p.diff = _diff(ds, ds, version.assignments, p.proposed)
        for k, v in _counts(p.diff).items():
            setattr(p, k, v)
        p.soft_after, p.proven_minimal = soft_score(ds, new)[1], True
        old_fest = state.fest_of(version)
        if old_fest is not None:      # show which Spectra bookings this move would change
            new_fest = decide_fest(ds, new, extra_requests=bookings.extras(db), time_limit_s=10)
            p.fest = state.fest_to_json(new_fest)
            p.conflicts = [{"code": c.code, "text": c.text} for c in _booking_changes(old_fest, new_fest)]
    db.add(p)
    db.flush()
    state.audit(db, user, f"change.{kind}", f"proposal:{p.id}", {"status": p.status})
    return p


def _guard(p: ChangeProposal, user: User) -> None:
    if user.role != "admin":
        raise forbidden("Only the Admin approves timetable changes")
    if p.kind in REQUEST_KINDS and p.requested_by == user.id:
        raise forbidden("You can't approve or reject your own request")
    if p.status != "pending":
        raise conflict(f"This proposal is already {p.status}")


def approve(db: Session, p: ChangeProposal, user: User, note: str = "") -> TimetableVersion:
    _guard(p, user)
    row, ds = state.active_dataset(db)
    version = state.active_version(db, row)
    if version is None or version.id != p.base_version:
        raise conflict("This proposal is out of date: the timetable changed after it was made. "
                       "Make the change again to get a fresh proposal.", {"code": "stale"})
    if "changes" in p.payload:
        ds2 = apply_changes(ds, p.payload)
    else:
        ds2 = ds
    proposed = state.to_assign(p.proposed or {})
    viol = check_timetable(ds2, proposed)
    if viol:
        raise ApiError(409, "conflict", f"The proposal no longer passes the hard-rule check ({viol[0].detail})")
    new_row = state.store_dataset(db, ds2, user, parent=row, change=p.payload) if ds2 is not ds else row
    v = state.save_version(db, ds2, new_row, proposed, "change" if ds2 is not ds else "manual", user,
                           parent=version, note=p.title)
    if version.fest is not None:
        bookings.adopt(db, ds2, v, p.fest, user)
    p.status, p.decided_by, p.decided_at, p.decision_note = "approved", user.id, datetime.now(timezone.utc), note or None
    state.audit(db, user, "change.approve", f"proposal:{p.id}", {"version": v.id})
    db.flush()
    return v


def reject(db: Session, p: ChangeProposal, user: User, note: str = "") -> None:
    _guard(p, user)
    p.status, p.decided_by, p.decided_at, p.decision_note = "rejected", user.id, datetime.now(timezone.utc), note or None
    state.audit(db, user, "change.reject", f"proposal:{p.id}", {"note": note})
    db.flush()


def get(db: Session, pid: int) -> ChangeProposal:
    p = db.get(ChangeProposal, pid)
    if p is None:
        raise not_found(f"No proposal {pid}")
    return p


def visible(db: Session, user: User, status: str | None = None) -> list[ChangeProposal]:
    q = select(ChangeProposal).order_by(ChangeProposal.id.desc())
    if status:
        q = q.where(ChangeProposal.status == status)
    if user.role != "admin":
        q = q.where(ChangeProposal.requested_by == user.id)
    return list(db.scalars(q))


def to_out(db: Session, p: ChangeProposal, user: User) -> dict:
    active = state.active_version(db)
    names = {u.id: u.name for u in db.scalars(select(User))}
    stale = p.status == "pending" and (active is None or active.id != p.base_version)
    can = (user.role == "admin" and p.status == "pending" and not stale and
           not (p.kind in REQUEST_KINDS and p.requested_by == user.id))
    return {"id": p.id, "kind": p.kind, "title": p.title, "status": p.status, "base_version": p.base_version,
            "stale": stale, "moved": p.moved, "time_changed": p.time_changed, "room_only": p.room_only,
            "added": p.added, "removed": p.removed, "soft_before": p.soft_before, "soft_after": p.soft_after,
            "hard_count": p.hard_count, "proven_minimal": p.proven_minimal, "conflicts": p.conflicts or [],
            "alternatives": p.alternatives or [], "diff": p.diff or [], "payload": p.payload,
            "requested_by": p.requested_by, "requested_by_name": names.get(p.requested_by, "?"),
            "decided_by_name": names.get(p.decided_by) if p.decided_by else None,
            "decision_note": p.decision_note, "created_at": p.created_at, "decided_at": p.decided_at,
            "can_approve": can}
