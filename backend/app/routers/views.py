from dataclasses import asdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth import current_user
from ..core.checker import _room_feats, check_fest, check_timetable, free_rooms, week_view
from ..core.model import LAST_TEACHING, block
from ..db import get_db
from ..errors import bad_request
from ..models import User
from ..schemas import DashboardOut, FreeRoom
from ..services import bookings, proposals, state

router = APIRouter(tags=["views"])


def pending_for(db: Session, user: User, v) -> list[dict]:
    """What is waiting for this person to approve: change proposals (Admin) and venue bookings that need
    their sign-off. Shared by the dashboard and Velo so both always agree."""
    pending = []
    if user.role == "admin":
        for p in proposals.visible(db, user, "pending"):
            if p.base_version == (v.id if v else None):
                pending.append({"kind": "change", "id": str(p.id), "title": p.title,
                                "requested_by": proposals.to_out(db, p, user)["requested_by_name"],
                                "created_at": p.created_at})
    for b in bookings.live_requests(db):
        if b.status == "pending_approval" and b.created_by != user.id and (
                user.role == "admin" or (user.role == "coordinator" and b.approver == user.department)):
            pending.append({"kind": "booking", "id": b.id, "title": b.data["title"],
                            "requested_by": b.data["requester"], "created_at": b.created_at})
    return pending


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db), user: User = Depends(current_user)):
    row, ds = state.active_dataset(db)
    v = state.active_version(db, row)
    ex = state.latest_exams(db, row)
    pending = pending_for(db, user, v)
    mine = (sum(1 for b in bookings.live_requests(db) if b.created_by == user.id) +
            sum(1 for r in ds.requests.values() if bookings.owns_dataset_request(user, r)))
    base = {"dataset_id": ds.dataset_id, "pending": pending, "exams_scheduled": len(ex.exams) if ex else 0,
            "exams_total": len(ds.exams), "total": len(ds.sessions), "my_requests": mine}
    if v is None:
        return DashboardOut(has_timetable=False, hard_count=0, soft={}, soft_total=0, placed=0, conflicts=[],
                            utilisation=[], grid={}, **base)
    assign = state.to_assign(v.assignments)
    conflicts = check_timetable(ds, assign)
    fest = state.fest_of(v)
    if fest:
        extra = bookings.extras(db)
        conflicts += check_fest(bookings._with_extras(ds, extra), assign, [asdict(d) for d in fest.decisions],
                                fest.overrides)[0]
    if ex:
        from ..core.checker import check_exams
        conflicts += check_exams(ds, ex.exams)[0]
    grid = {r: {d: [0] * LAST_TEACHING for d in ds.days} for r in ds.rooms}
    for sid, (day, start, room) in assign.items():
        for p in block(start, ds.sessions[sid]["duration"]):
            if room in grid and day in grid[room] and p <= LAST_TEACHING:
                grid[room][day][p - 1] = 1
    total_hours = len(ds.days) * LAST_TEACHING
    util = []
    for rid, r in ds.rooms.items():
        used = sum(sum(x) for x in grid[rid].values())
        util.append({"room_id": rid, "name": r.get("name", rid), "type": r["type"], "capacity": r["capacity"],
                     "used_hours": used, "total_hours": total_hours, "pct": round(100 * used / total_hours, 1)})
    return DashboardOut(has_timetable=True, version_id=v.id, solver_status=v.solver_status, hard_count=len(conflicts), soft=v.soft,
                        soft_total=v.soft_total, placed=len(assign), conflicts=[asdict(c) for c in conflicts[:100]],
                        utilisation=util, grid=grid, fest=bookings.summary(db, ds, v), **base)


@router.get("/rooms/free", response_model=list[FreeRoom])
def rooms_free(day: str, from_period: int = Query(alias="from", ge=1, le=13),
               to_period: int = Query(alias="to", ge=1, le=13), capacity: int = Query(1, ge=1),
               needs: str = "", types: str = "", week: str = "regular",
               db: Session = Depends(get_db), _: User = Depends(current_user)):
    """Rooms free for the whole of day P{from}-P{to}. week=spectra also counts Week-7 bookings."""
    row, ds = state.active_dataset(db)
    if day not in ds.days:
        raise bad_request(f"day must be one of {', '.join(ds.days)}")
    if to_period < from_period:
        raise bad_request("'to' must not be before 'from'")
    v = state.require_version(db, row)
    assign = state.to_assign(v.assignments)
    taken = []
    fest = state.fest_of(v)
    if week == "spectra" and fest:
        assign = week_view(ds, assign, fest.overrides)
        taken = [{"room_id": d.room_id, "day": d.day, "start_period": d.start_period, "end_period": d.end_period,
                  "request_id": d.request_id} for d in fest.decisions if d.room_id and d.status != "rejected"]
    want = [n for n in needs.split(",") if n]
    room_types = [t for t in types.split(",") if t] or None
    ids = free_rooms(ds, assign, taken, day, from_period, to_period, capacity, want, room_types)
    # free_rooms answers for events; for teaching hours, also allow rooms that only take classes
    if to_period <= LAST_TEACHING:
        busy = {(r, d, p) for sid, (d, s0, r) in assign.items() for p in block(s0, ds.sessions[sid]["duration"])}
        busy |= {(t["room_id"], t["day"], p) for t in taken for p in range(t["start_period"], t["end_period"] + 1)}
        for rid, r in sorted(ds.rooms.items(), key=lambda kv: (kv[1]["capacity"], kv[0])):
            if rid in ids or r["capacity"] < capacity or set(want) - _room_feats(r):
                continue
            if room_types and r["type"] not in room_types:
                continue
            if any((rid, day, p) in busy or (day, p) in ds.room_un[rid] for p in range(from_period, to_period + 1)):
                continue
            ids.append(rid)
        ids.sort(key=lambda i: (ds.rooms[i]["capacity"], i))
    return [{"id": i, "name": ds.rooms[i].get("name", i), "type": ds.rooms[i]["type"],
             "capacity": ds.rooms[i]["capacity"], "features": ds.rooms[i]["features"],
             "accessible": ds.rooms[i]["accessible"]} for i in ids]
