from dataclasses import asdict
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth import current_user, require_roles
from ..config import settings
from ..core.checker import week_view
from ..core.explain import explain_session
from ..db import get_db
from ..errors import ApiError, bad_request, forbidden, not_found
from ..models import User
from ..schemas import ExplainSessionOut, GenerateIn, GenerateOut, ManualMoveIn, ManualMoveOut, TimetableOut
from ..services import bookings, proposals, state
from ..solver.timetable import solve_timetable

router = APIRouter(tags=["timetable"])


def course_titles(ds) -> dict[str, str]:
    return {c["id"]: c.get("title", c["id"]) for c in ds.raw.get("courses", [])}


def course_dept(ds, sid: str) -> str | None:
    s = ds.sessions.get(sid)
    if not s:
        return None
    return next((c.get("department") for c in ds.raw.get("courses", []) if c["id"] == s["course_id"]), None) \
        or ds.faculty.get(s["faculty_id"], {}).get("department")


@router.post("/timetable/generate", response_model=GenerateOut)
def generate(body: GenerateIn | None = None, db: Session = Depends(get_db),
             user: User = Depends(require_roles("admin"))):
    row, ds = state.active_dataset(db)
    limit = (body.time_limit_s if body and body.time_limit_s else None) or settings.solver_time_limit_s
    r = solve_timetable(ds, limit, workers=settings.solver_workers)
    if r.assign is None:
        raise ApiError(422, r.status, "No clash-free timetable was found" +
                       (" in the time limit; try a longer limit" if r.status == "timeout" else
                        ": the data has conflicting hard constraints. Check faculty unavailability and room closures."))
    v = state.save_version(db, ds, row, r.assign, "generated", user, solver_status=r.status, solve_ms=r.solve_ms)
    _, stats = bookings.redecide(db, ds, v, user)
    db.commit()
    return GenerateOut(version_id=v.id, status=r.status, hard_count=0, soft=r.soft, soft_total=r.soft_total,
                       placed=len(r.assign), total=len(ds.sessions), solve_ms=r.solve_ms,
                       fest=bookings.summary(db, ds, v))


def _entries(ds, assign, titles, keep, moved=frozenset()):
    out = []
    for sid, (day, start, room) in sorted(assign.items(), key=lambda kv: (ds.days.index(kv[1][0]), kv[1][1], kv[0])):
        s = ds.sessions.get(sid)
        if s is None or not keep(sid, s, room):
            continue
        f = ds.faculty.get(s["faculty_id"], {})
        out.append({"session_id": sid, "course_id": s["course_id"], "course_title": titles.get(s["course_id"], s["course_id"]),
                    "kind": s["kind"], "day": day, "start_period": start, "duration": s["duration"], "room_id": room,
                    "faculty_id": s["faculty_id"], "faculty_name": f.get("name", s["faculty_id"]),
                    "groups": s["groups"], "size": s["size"], "basket_slot": s.get("basket_slot"),
                    "week7_moved": sid in moved})
    return out


@router.get("/timetable", response_model=TimetableOut)
def timetable(view: Literal["group", "faculty", "room", "all"] = "group", id: str = "",
              week: Literal["regular", "spectra"] = "regular", db: Session = Depends(get_db),
              user: User = Depends(current_user)):
    row, ds = state.active_dataset(db)
    v = state.require_version(db, row)
    if view == "faculty" and user.role == "faculty" and id != user.faculty_id:
        raise forbidden("Faculty accounts can only open their own timetable")
    if view != "all" and not id:
        raise bad_request(f"Pick a {view}")
    known = {"group": ds.groups, "faculty": ds.faculty, "room": ds.rooms}.get(view)
    if known is not None and id not in known:
        raise not_found(f"No {view} called {id}")
    assign = state.to_assign(v.assignments)
    fest = state.fest_of(v)
    moved = set()
    if week == "spectra" and fest:
        assign = week_view(ds, assign, fest.overrides)
        moved = {o["session_id"] for o in fest.overrides}
    keep = {"group": lambda sid, s, room: id in s["groups"], "faculty": lambda sid, s, room: s["faculty_id"] == id,
            "room": lambda sid, s, room: room == id, "all": lambda sid, s, room: True}[view]
    entries = _entries(ds, assign, course_titles(ds), keep, moved)
    booked = []
    if week == "spectra" and fest:
        reqs = {**ds.requests, **{r["id"]: r for r in bookings.extras(db)}}
        live_status = {b.id: b.status for b in bookings.live_requests(db)}
        for d in fest.decisions:
            r = reqs.get(d.request_id)
            if not r or not d.room_id or d.status == "rejected":
                continue
            if (view == "room" and d.room_id == id) or (view == "group" and id in r.get("mandatory_for_groups", [])) \
                    or view == "all":
                booked.append({"request_id": d.request_id, "title": r["title"],
                               "status": live_status.get(d.request_id, d.status), "day": d.day,
                               "start_period": d.start_period, "end_period": d.end_period, "room_id": d.room_id,
                               "attendance": r["attendance"]})
    return TimetableOut(version_id=v.id, view=view, id=id, week=week, entries=entries, bookings=booked)


@router.post("/timetable/manual", response_model=ManualMoveOut)
def manual(body: ManualMoveIn, db: Session = Depends(get_db), user: User = Depends(require_roles("admin", "coordinator"))):
    """Move one session by hand. Hard rules are checked by code; a valid move becomes a proposal the
    Admin approves (or applies, for the Admin's own moves, after reviewing the diff)."""
    row, ds = state.active_dataset(db)
    v = state.require_version(db, row)
    if user.role == "coordinator" and course_dept(ds, body.session_id) != user.department:
        raise forbidden(f"Coordinators can only move {user.department} sessions")
    assign, viol = proposals.check_manual(ds, v, body.session_id, body.day, body.start_period, body.room_id)
    if viol:
        raise ApiError(422, "hard_violations", viol[0].detail, {
            "violations": [asdict(x) for x in viol],
            "suggestions": proposals.suggestions(ds, assign, body.session_id)})
    p = proposals.from_move(db, row, ds, v, body.session_id, body.day, body.start_period, body.room_id, "manual",
                            f"Move {body.session_id} to {body.day} P{body.start_period} {body.room_id}", user, body.reason)
    db.commit()
    return ManualMoveOut(ok=True, violations=[], suggestions=[], proposal_id=p.id)


@router.post("/timetable/check-move", response_model=ManualMoveOut)
def check_move_only(body: ManualMoveIn, db: Session = Depends(get_db), _: User = Depends(current_user)):
    """Dry run of a manual move: the rules it breaks and valid slots instead. Saves nothing."""
    row, ds = state.active_dataset(db)
    v = state.require_version(db, row)
    assign, viol = proposals.check_manual(ds, v, body.session_id, body.day, body.start_period, body.room_id)
    return ManualMoveOut(ok=not viol, violations=[asdict(x) for x in viol],
                         suggestions=proposals.suggestions(ds, assign, body.session_id) if viol else [])


@router.get("/explain/session/{session_id}", response_model=ExplainSessionOut)
def explain(session_id: str, words: bool = Query(False), db: Session = Depends(get_db), _: User = Depends(current_user)):
    row, ds = state.active_dataset(db)
    v = state.require_version(db, row)
    assign = state.to_assign(v.assignments)
    if session_id not in assign:
        raise not_found(f"No session {session_id} in the timetable")
    out = explain_session(ds, assign, session_id)
    if words:
        from ..llm.reword import reword
        out["words"] = reword(out["facts"])
    return out
