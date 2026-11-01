"""Velo's tools: the only way the agent reaches campus data. Each tool is a thin, typed wrapper over a service the
pages already use (room search, the booking checker, the repair solver, explanations), so the agent can't say
anything the app wouldn't.

The permission layer is here, not in the prompt: a tool is offered only to the roles listed on it, every call is
re-checked against the signed-in account, and the services keep their own ownership checks. Tools never write.
Action tools validate with the real checker and leave a pending action (velo_actions) that runs only when the
person presses Confirm (see confirm() below)."""
import re
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Callable, Literal

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import update
from sqlalchemy.orm import Session

from ..config import settings
from ..core.checker import _room_feats, week_view
from ..core.explain import _time, explain_booking
from ..core.model import LAST_TEACHING, MAX_PERIOD, Dataset, block
from ..errors import ApiError, bad_request, conflict, forbidden, not_found
from ..llm.parse_booking import ROLE_DEFAULT
from ..models import User, VeloAction
from ..routers.exams import get_exams
from ..routers.timetable import course_dept, course_titles
from ..routers.timetable import timetable as timetable_view
from ..routers.views import dashboard, pending_for, rooms_free
from . import bookings, proposals, state
from .velo import DAY, PAGE_LABEL, ROLE_PAGES, STATUS, _proposal, _request_row, _session_card, card, when

ALL = ("admin", "coordinator", "faculty", "club")
STAFF = ("admin", "coordinator")
TEACHING = ("admin", "coordinator", "faculty")
Day = Literal["MON", "TUE", "WED", "THU", "FRI", "SAT"]
Week = Literal["regular", "spectra"]
PAGES = {"overview": "/", "timetable": "/timetable", "exams": "/exams", "spectra": "/spectra", "changes": "/changes",
         "approvals": "/approvals", "rooms": "/rooms", "book": "/book", "data": "/data", "settings": "/settings"}


class ToolError(Exception):
    """A problem the person can fix (unknown room, not allowed). The model is told and explains it."""


@dataclass
class Ctx:
    db: Session
    user: User
    conversation_id: str | None = None
    today: str | None = None


@dataclass
class Out:
    data: dict                       # what the model reads (compact, factual)
    cards: list[dict] = field(default_factory=list)
    navigate: str | None = None
    memory: dict = field(default_factory=dict)


@dataclass
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    roles: tuple[str, ...]
    kind: Literal["read", "simulate", "action", "navigate"]
    fn: Callable[[Ctx, BaseModel], Out]


TOOLS: dict[str, Tool] = {}


def tool(name: str, description: str, args: type[BaseModel], roles=ALL, kind="read"):
    def wrap(fn):
        TOOLS[name] = Tool(name, description, args, tuple(roles), kind, fn)
        return fn
    return wrap


# ---------------------------------------------------------------- helpers
def _ds(ctx: Ctx):
    row, ds = state.active_dataset(ctx.db)
    return row, ds, state.active_version(ctx.db, row)


def _need_version(ctx: Ctx):
    row, ds, v = _ds(ctx)
    if v is None:
        raise ToolError("No timetable has been generated yet. An Admin can generate one on the Timetable page.")
    return row, ds, v


def _day(ds: Dataset, day: str) -> str:
    d = day.upper()[:3]
    if d not in ds.days:
        raise ToolError(f"{day} is not a teaching day. Days: {', '.join(ds.days)}")
    return d


def _find(table: dict, key: str, what: str, name_key: str = "name") -> str:
    """An id from an id or a name ("CS Lab 2", "Dr. Mishra"): exact id, then exact name, then a unique partial."""
    k = key.strip()
    if k.upper() in table:
        return k.upper()
    if k in table:
        return k
    low = k.lower()
    exact = [i for i, r in table.items() if str(r.get(name_key, "")).lower() == low]
    if len(exact) == 1:
        return exact[0]
    squashed = re.sub(r"[^a-z0-9]", "", low)
    same = [i for i in table if re.sub(r"[^a-z0-9]", "", i.lower()) == squashed]      # "cs lab 2" -> CS-LAB-2
    if len(same) == 1:
        return same[0]
    words = [w for w in re.split(r"[^a-z0-9]+", low) if w and w not in ("dr", "prof", "the", "room")]

    def fits(i: str, r: dict) -> bool:          # every word starts a word of the id or name ("comp" -> Computing)
        tokens = re.split(r"[^a-z0-9]+", f"{i} {r.get(name_key, '')}".lower())
        return all(any(t.startswith(w) for t in tokens) for w in words)
    part = [i for i, r in table.items() if words and fits(i, r)]
    if len(part) == 1:
        return part[0]
    if part:
        raise ToolError(f"'{key}' matches more than one {what}: {', '.join(part[:6])}. Which one?")
    raise ToolError(f"No {what} called '{key}'")


def _d(x) -> dict:
    """Router functions return pydantic models; tools work on plain dicts."""
    return x.model_dump() if hasattr(x, "model_dump") else x


def _slot_label(ds: Dataset, p: int) -> str:
    return _time(ds, p, 1)


def _entry_row(ds: Dataset, e: dict) -> dict:
    return {"day": DAY.get(e["day"], e["day"]), "time": _time(ds, e["start_period"], e["duration"]),
            "course": f"{e['course_id']} {e['kind']}", "title": e["course_title"], "room": e["room_id"],
            "faculty": e["faculty_name"], "groups": ", ".join(e["groups"])}


TT_COLUMNS = [{"key": "day", "label": "Day"}, {"key": "time", "label": "Time"}, {"key": "course", "label": "Class"},
              {"key": "room", "label": "Room"}, {"key": "faculty", "label": "Faculty"}, {"key": "groups", "label": "Groups"}]


def _schedule(ctx: Ctx, view: str, ident: str, week: str, day: str | None, title: str) -> Out:
    row, ds, v = _need_version(ctx)
    try:
        tt = timetable_view(view=view, id=ident, week=week, db=ctx.db, user=ctx.user)
    except ApiError as e:
        raise ToolError(e.message) from e
    entries = [e for e in map(_d, tt.entries) if not day or e["day"] == _day(ds, day)]
    rows = [_entry_row(ds, e) for e in entries]
    hours = sum(e["duration"] for e in entries)
    data = {"view": view, "id": ident, "week": week, "day": day, "sessions": len(rows), "hours": hours,
            "entries": [{k: r[k] for k in ("day", "time", "course", "room", "groups", "faculty")} for r in rows[:40]]}
    if week == "spectra":
        data["bookings"] = [_d(b) for b in tt.bookings][:20]
    cols = [c for c in TT_COLUMNS if not (view == "group" and c["key"] == "groups" or view == "faculty" and c["key"] == "faculty"
                                          or day and c["key"] == "day")]
    sub = f"{len(rows)} session{'s' if len(rows) != 1 else ''}, {hours} hour{'s' if hours != 1 else ''}" + \
          (" in Spectra week" if week == "spectra" else " a week" if not day else "")
    return Out(data, [card("table", title=title, subtitle=sub, columns=cols, rows=rows, kind="timetable")])


# ---------------------------------------------------------------- timetable
class MyTimetable(BaseModel):
    day: str | None = Field(None, description="Only this day, e.g. TUE")
    week: Week = "regular"


@tool("get_my_timetable", "The signed-in person's own teaching timetable (faculty), or their department's "
      "timetable (coordinators). Club accounts and the Admin have no personal timetable.", MyTimetable)
def get_my_timetable(ctx: Ctx, a: MyTimetable) -> Out:
    u = ctx.user
    if u.role == "faculty" and u.faculty_id:
        return _schedule(ctx, "faculty", u.faculty_id, a.week, a.day, "Your timetable")
    if u.role == "coordinator":
        row, ds, v = _need_version(ctx)
        tt = timetable_view(view="all", id="", week=a.week, db=ctx.db, user=u)
        entries = [_d(e) for e in tt.entries]
        entries = [e for e in entries if course_dept(ds, e["session_id"]) == u.department
                   and (not a.day or e["day"] == _day(ds, a.day))]
        rows = [_entry_row(ds, e) for e in entries]
        return Out({"department": u.department, "sessions": len(rows), "entries": rows[:40]},
                   [card("table", title=f"{u.department} timetable", subtitle=f"{len(rows)} sessions",
                         columns=TT_COLUMNS, rows=rows, kind="timetable")])
    raise ToolError("This account has no personal timetable. Ask for a student group's or a faculty member's "
                    "timetable instead.")


class FacultyArgs(BaseModel):
    faculty: str = Field(description="Faculty id like F01, or their name")
    day: str | None = None
    week: Week = "regular"


@tool("get_faculty_schedule", "A faculty member's timetable. Faculty accounts may only see their own.",
      FacultyArgs, roles=TEACHING)
def get_faculty_schedule(ctx: Ctx, a: FacultyArgs) -> Out:
    _, ds, _ = _ds(ctx)
    fid = _find(ds.faculty, a.faculty, "faculty member")
    out = _schedule(ctx, "faculty", fid, a.week, a.day, f"{ds.faculty[fid]['name']} ({fid})")
    out.memory = {"faculty_id": fid}
    return out


class GroupArgs(BaseModel):
    group: str = Field(description="Student group id like Y1-A or Y2-CSE")
    day: str | None = None
    week: Week = "regular"


@tool("get_group_schedule", "A student group's (section's) timetable.", GroupArgs)
def get_group_schedule(ctx: Ctx, a: GroupArgs) -> Out:
    _, ds, _ = _ds(ctx)
    gid = _find(ds.groups, a.group, "student group")
    out = _schedule(ctx, "group", gid, a.week, a.day, f"{gid} · {ds.groups[gid].get('name', gid)}")
    out.memory = {"group_id": gid}
    return out


class ExplainArgs(BaseModel):
    session_id: str | None = Field(None, description="Session id like S014, if known")
    course_id: str | None = Field(None, description="Course code like CS101")
    kind: Literal["lecture", "tutorial", "lab"] | None = None
    day: str | None = None


@tool("explain_scheduling_decision", "Why a class is where it is: the hard rules that rule out other slots and the "
      "soft penalty of this one, plus valid alternative slots. Computed by the constraint checker.", ExplainArgs)
def explain_scheduling_decision(ctx: Ctx, a: ExplainArgs) -> Out:
    row, ds, v = _need_version(ctx)
    assign = state.to_assign(v.assignments)
    sid = a.session_id.upper() if a.session_id else None
    if sid and sid not in assign:
        raise ToolError(f"No session {sid} in the timetable")
    if not sid:
        if not a.course_id:
            raise ToolError("Say which class: a course code like CS101 or a session id")
        cid = a.course_id.upper().replace(" ", "")
        cands = [s for s, x in ds.sessions.items() if x["course_id"] == cid and s in assign
                 and (not a.kind or x["kind"] == a.kind) and (not a.day or assign[s][0] == _day(ds, a.day))]
        if ctx.user.faculty_id:
            cands = [s for s in cands if ds.sessions[s]["faculty_id"] == ctx.user.faculty_id] or cands
        if not cands:
            raise ToolError(f"No scheduled session of {cid}" + (f" ({a.kind})" if a.kind else ""))
        cands.sort(key=lambda s: (ds.days.index(assign[s][0]), assign[s][1]))
        sid = cands[0]
    head, ex = _session_card(SimpleNamespace(user=ctx.user), ds, assign, sid)
    data = {**{k: head[k] for k in ("session_id", "course_id", "kind", "groups", "faculty", "when", "room", "can_move")},
            "facts": ex["facts"], "slots_breaking_hard_rules": ex["blocked"], "slots_considered": ex["total"],
            "valid_alternatives": [{k: o[k] for k in ("when", "room", "soft_delta")} for o in ex["options"][:5]]}
    return Out(data, [card("explain", **head, facts=ex["facts"], options=ex["options"][:3], blocked=ex["blocked"],
                           total=ex["total"])], memory={"session_id": sid, "course_id": head["course_id"]})


# ---------------------------------------------------------------- rooms
class FreeArgs(BaseModel):
    day: str = Field(description="MON..SAT")
    from_period: int = Field(ge=1, le=MAX_PERIOD)
    to_period: int = Field(ge=1, le=MAX_PERIOD)
    capacity: int = Field(1, ge=1, le=5000)
    needs: list[str] = Field(default_factory=list, description="Features like projector, pa_system, stage, ac, computers")
    room_types: list[str] = Field(default_factory=list, description="classroom, lecture_hall, seminar_hall, auditorium, lab_cs ...")
    week: Week = Field("regular", description="spectra for Spectra week (week 7), which also counts event bookings")


@tool("find_available_rooms", "Rooms free for the whole of a period range on a day, with capacity and features. "
      "Read-only; use it for 'is X free' and 'which rooms are free' questions.", FreeArgs)
def find_available_rooms(ctx: Ctx, a: FreeArgs) -> Out:
    row, ds, v = _need_version(ctx)
    day = _day(ds, a.day)
    if a.to_period < a.from_period:
        raise ToolError("The end period is before the start period")
    try:
        rooms = rooms_free(day=day, from_period=a.from_period, to_period=a.to_period, capacity=a.capacity,
                           needs=",".join(a.needs), types=",".join(a.room_types), week=a.week, db=ctx.db, _=ctx.user)
    except ApiError as e:
        raise ToolError(e.message) from e
    slot = when(ds, day, a.from_period, a.to_period)
    data = {"when": slot, "week": a.week, "capacity_needed": a.capacity, "free_count": len(rooms),
            "rooms": [{k: r[k] for k in ("id", "name", "type", "capacity", "features")} for r in rooms[:15]]}
    return Out(data, [card("rooms", day=day, start=a.from_period, end=a.to_period, when=slot,
                           people=a.capacity if a.capacity > 1 else None, needs=a.needs, week=a.week,
                           total=len(rooms), rooms=rooms[:6])],
               memory={"day": day, "from_period": a.from_period, "to_period": a.to_period})


class RoomArgs(BaseModel):
    room: str = Field(description="Room id like LH-1 or a name like 'CS Lab 2'")


@tool("get_room_details", "A room's capacity, type, features, accessibility, allowed uses, building and "
      "maintenance closures.", RoomArgs)
def get_room_details(ctx: Ctx, a: RoomArgs) -> Out:
    _, ds, _ = _ds(ctx)
    rid = _find(ds.rooms, a.room, "room")
    r = ds.rooms[rid]
    closed = [{"day": DAY.get(x["day"], x["day"]), "periods": x["periods"], "reason": x.get("reason", "")}
              for x in ds.raw.get("room_unavailability", []) if x["room_id"] == rid]
    data = {"id": rid, "name": r.get("name", rid), "building": r.get("building"), "type": r["type"],
            "capacity": r["capacity"], "exam_capacity": r["capacity"] // 2, "features": r["features"],
            "accessible": r["accessible"], "allowed_uses": r.get("allowed_uses", []), "closures": closed}
    rows = [{"label": "Type", "value": r["type"].replace("_", " ")}, {"label": "Capacity", "value": str(r["capacity"])},
            {"label": "Exam seats", "value": f"{r['capacity'] // 2} (half capacity)"},
            {"label": "Features", "value": ", ".join(f.replace("_", " ") for f in r["features"]) or "none"},
            {"label": "Step-free access", "value": "yes" if r["accessible"] else "no"},
            {"label": "Building", "value": r.get("building") or "—"}]
    rows += [{"label": "Closed", "value": f"{c['day']} P{min(c['periods'])}–P{max(c['periods'])}: {c['reason']}"} for c in closed]
    return Out(data, [card("stats", title=f"{rid} · {r.get('name', rid)}", items=rows)], memory={"room_id": rid})


class OccupancyArgs(BaseModel):
    room: str
    day: str
    week: Week = "regular"


@tool("get_room_occupancy", "Period by period, what a room has on a day: classes, approved event bookings, "
      "pending requests, closures and free periods. This is scheduled occupancy, not live sensor data.", OccupancyArgs)
def get_room_occupancy(ctx: Ctx, a: OccupancyArgs) -> Out:
    row, ds, v = _need_version(ctx)
    rid, day = _find(ds.rooms, a.room, "room"), _day(ds, a.day)
    assign = state.to_assign(v.assignments)
    fest = state.fest_of(v)
    if a.week == "spectra" and fest:
        assign = week_view(ds, assign, fest.overrides)
    titles = course_titles(ds)
    last = MAX_PERIOD if a.week == "spectra" else LAST_TEACHING
    cells = {p: {"period": p, "time": _slot_label(ds, p), "state": "free", "label": ""} for p in range(1, last + 1)}
    for p in range(1, last + 1):
        if (day, p) in ds.room_un[rid]:
            cells[p].update(state="closed", label="Closed for maintenance")
    for sid, (d, s0, r) in assign.items():
        if r == rid and d == day:
            s = ds.sessions[sid]
            for p in block(s0, s["duration"]):
                if p in cells:
                    cells[p].update(state="class", label=f"{s['course_id']} {s['kind']} · {', '.join(s['groups'])}",
                                    ref=sid, title=titles.get(s["course_id"], ""))
    if a.week == "spectra" and fest:
        live = {b.id: b for b in bookings.live_requests(ctx.db)}
        reqs = {**ds.requests, **{r["id"]: r for r in bookings.extras(ctx.db)}}
        for dec in fest.decisions:
            if dec.room_id != rid or dec.day != day or dec.status == "rejected":
                continue
            st = live[dec.request_id].status if dec.request_id in live else dec.status
            kind = "pending" if st == "pending_approval" else "booked"
            for p in range(dec.start_period, dec.end_period + 1):
                if p in cells:
                    cells[p].update(state=kind, label=f"{dec.request_id} {reqs.get(dec.request_id, {}).get('title', '')}",
                                    ref=dec.request_id)
    periods = list(cells.values())
    free = [c["period"] for c in periods if c["state"] == "free"]
    data = {"room": rid, "day": DAY[day], "week": a.week, "free_periods": free,
            "periods": [{k: c[k] for k in ("period", "time", "state", "label")} for c in periods],
            "note": "Scheduled occupancy from the timetable and bookings; there is no live sensor data."}
    return Out(data, [card("occupancy", room=rid, room_name=ds.rooms[rid].get("name", rid), day=day, day_label=DAY[day],
                           week=a.week, periods=periods)], memory={"room_id": rid, "day": day})


# ---------------------------------------------------------------- bookings and Spectra
class StatusArgs(BaseModel):
    request_id: str | None = Field(None, description="BR-03 or APP-0002; empty for all of the person's requests")


@tool("get_booking_status", "Status of the person's venue booking requests, or one request with the reason for "
      "its decision.", StatusArgs)
def get_booking_status(ctx: Ctx, a: StatusArgs) -> Out:
    row, ds, v = _ds(ctx)
    if a.request_id:
        rid = a.request_id.upper()
        try:
            r = bookings.get_request(ctx.db, ds, v, ctx.user, rid)
        except ApiError as e:
            raise ToolError(e.message) from e
        item = _request_row(ds, r)
        f = state.fest_of(v)
        why = explain_booking(ds, f, rid) if f and rid in {d.request_id for d in f.decisions} else None
        data = {**item, "status_text": STATUS.get(r["status"], r["status"]),
                "facts": why["facts"] if why else [], "lost_to": why["lost_to"] if why else None}
        return Out(data, [card("requests", items=[item])], memory={"request_id": rid})
    mine = bookings.list_requests(ctx.db, ds, v, ctx.user, mine=True)
    items = [_request_row(ds, r) for r in mine[-10:][::-1]]
    data = {"count": len(mine), "requests": [{k: i[k] for k in ("id", "title", "status", "when", "room", "reason")}
                                             for i in items]}
    return Out(data, [card("requests", items=items)] if items else [])


@tool("get_pending_approvals", "Booking requests and timetable change proposals waiting for this person to decide "
      "(Admin and coordinators).", BaseModel, roles=STAFF)
def get_pending_approvals(ctx: Ctx, a: BaseModel) -> Out:
    row, ds, v = _ds(ctx)
    items = pending_for(ctx.db, ctx.user, v)
    data = {"count": len(items), "items": [{k: i[k] for k in ("kind", "id", "title", "requested_by")} for i in items[:15]]}
    return Out(data, [card("approvals", items=items[:8], total=len(items), mine=False)])


class SpectraArgs(BaseModel):
    request_id: str | None = Field(None, description="One request to explain; empty for the whole board")


@tool("get_spectra_decisions", "Spectra week (week 7) venue allocation: the decision for each request, the reason "
      "from the priority and constraint checks, and the official priority order.", SpectraArgs)
def get_spectra_decisions(ctx: Ctx, a: SpectraArgs) -> Out:
    row, ds, v = _need_version(ctx)
    f = state.fest_of(v)
    if f is None:
        raise ToolError("Spectra week requests have not been decided yet.")
    order = ds.priority_order
    if a.request_id:
        rid = a.request_id.upper()
        live = {b.id: b for b in bookings.live_requests(ctx.db)}
        if rid in live and ctx.user.role != "admin" and live[rid].created_by != ctx.user.id and not (
                ctx.user.role == "coordinator" and live[rid].approver == ctx.user.department):
            raise ToolError("You can only see the reasons for your own requests")
        if rid not in {d.request_id for d in f.decisions}:
            raise ToolError(f"{rid} has not been decided yet")
        ex = explain_booking(ds, f, rid)
        r = bookings.get_request(ctx.db, ds, v, ctx.user, rid) if rid in live or rid in ds.requests else None
        data = {**ex, "priority_order": order, "category": (r or {}).get("category")}
        rows = [{"label": "Decision", "value": STATUS.get(ex["status"], ex["status"])},
                {"label": "Reason", "value": ex["reason"] or "—"}]
        if ex.get("placed_at"):
            p = ex["placed_at"]
            rows.append({"label": "Placed", "value": f"{p['room']}, {when(ds, p['day'], p['start'], p['end'])}"})
        if ex.get("lost_to"):
            rows.append({"label": "Lost to", "value": str(ex["lost_to"])})
        rows += [{"label": "Check", "value": fact} for fact in ex["facts"][:6]]
        return Out(data, [card("stats", title=f"Spectra decision · {rid}", items=rows)], memory={"request_id": rid})
    summ = bookings.summary(ctx.db, ds, v) or {}
    reqs = bookings.list_requests(ctx.db, ds, v, ctx.user)
    items = [_request_row(ds, r) for r in reqs]
    data = {"summary": summ, "priority_order": order,
            "requests": [{k: i[k] for k in ("id", "title", "status", "when", "room")} for i in items[:30]]}
    stats = [{"label": "Approved", "value": str(summ.get("approved", 0))},
             {"label": "Offered another slot", "value": str(summ.get("alternatives", 0))},
             {"label": "Rejected", "value": str(summ.get("rejected", 0))},
             {"label": "Waiting for approval", "value": str(summ.get("pending", 0))},
             {"label": "Priority order", "value": " › ".join(o.replace("_", " ") for o in order)}]
    return Out(data, [card("stats", title="Spectra week board", items=stats),
                      card("requests", items=items[:8])])


# ---------------------------------------------------------------- exams
class ExamArgs(BaseModel):
    course_id: str | None = None
    group: str | None = None
    day: str | None = None


@tool("get_exam_schedule", "The examination schedule: day, session, rooms and seats. Exam seats are half a room's "
      "capacity.", ExamArgs)
def get_exam_schedule(ctx: Ctx, a: ExamArgs) -> Out:
    _, ds, _ = _ds(ctx)
    ex = get_exams(db=ctx.db, _=ctx.user)
    rows = [_d(e) for e in ex.exams]
    if not rows:
        return Out({"scheduled": 0, "total": ex.total, "note": "No exam schedule has been generated yet."})
    if a.course_id:
        rows = [e for e in rows if a.course_id.upper().replace(" ", "") in e["course_ids"]]
    if a.group:
        g = _find(ds.groups, a.group, "student group")
        rows = [e for e in rows if g in e["groups"]]
    if a.day:
        rows = [e for e in rows if str(e["day"]).upper().startswith(a.day.upper()[:3])]
    table = [{"exam": e["exam_id"], "courses": ", ".join(e["course_ids"]), "day": e["day"], "session": str(e["session"]),
              "rooms": ", ".join(e["rooms"]), "seats": f"{e['seats']} for {e['size']}", "groups": ", ".join(e["groups"])}
             for e in rows]
    data = {"count": len(table), "hard_violations": ex.hard_count, "exams": table[:30],
            "rule": "Each room seats half its capacity in exams"}
    cols = [{"key": k, "label": lbl} for k, lbl in (("exam", "Exam"), ("day", "Day"), ("session", "Session"),
                                                     ("rooms", "Rooms"), ("seats", "Seats"), ("groups", "Groups"))]
    return Out(data, [card("table", title="Exam schedule", subtitle=f"{len(table)} exams · seats at half capacity",
                           columns=cols, rows=table, kind="exams")])


# ---------------------------------------------------------------- analysis
@tool("get_schedule_conflicts", "Hard-rule violations in the active timetable, Spectra week and exams, from the "
      "constraint checker.", BaseModel, roles=STAFF)
def get_schedule_conflicts(ctx: Ctx, a: BaseModel) -> Out:
    _need_version(ctx)
    d = dashboard(db=ctx.db, user=ctx.user)
    rows = [{"rule": c["rule"], "where": c["where"], "detail": c["detail"]} for c in map(_d, d.conflicts[:30])]
    data = {"hard_violations": d.hard_count, "soft_penalty": d.soft_total, "conflicts": rows[:15]}
    cards = [card("stats", title="Constraint check", items=[
        {"label": "Hard-rule violations", "value": str(d.hard_count)},
        {"label": "Soft penalty", "value": str(d.soft_total)},
        {"label": "Sessions placed", "value": f"{d.placed} of {d.total}"}])]
    if rows:
        cards.append(card("table", title="Violations", columns=[{"key": "rule", "label": "Rule"},
                                                                 {"key": "where", "label": "Where"},
                                                                 {"key": "detail", "label": "Detail"}], rows=rows))
    return Out(data, cards)


class UtilArgs(BaseModel):
    room_type: str | None = None
    order: Literal["most", "least"] = "most"


@tool("get_room_utilisation", "Teaching hours used per room in the active timetable, as a share of teaching hours "
      "in the week.", UtilArgs, roles=STAFF)
def get_room_utilisation(ctx: Ctx, a: UtilArgs) -> Out:
    _need_version(ctx)
    d = dashboard(db=ctx.db, user=ctx.user)
    util = [_d(u) for u in d.utilisation]
    if a.room_type:
        util = [u for u in util if u["type"] == a.room_type]
    util.sort(key=lambda u: -u["pct"] if a.order == "most" else u["pct"])
    avg = round(sum(u["pct"] for u in util) / len(util), 1) if util else 0
    data = {"average_pct": avg, "rooms": [{k: u[k] for k in ("room_id", "type", "used_hours", "total_hours", "pct")}
                                          for u in util[:15]]}
    return Out(data, [card("bars", title=f"Room utilisation ({a.order} used)", unit="%", note=f"Average {avg}%",
                           items=[{"label": u["room_id"], "value": u["pct"], "max": 100,
                                   "sub": f"{u['used_hours']}/{u['total_hours']} h"} for u in util[:10]])])


def workload(ds: Dataset, assign) -> dict[str, dict]:
    out = {f: {"hours": 0, "sessions": 0, "by_day": {d: 0 for d in ds.days}} for f in ds.faculty}
    for sid, (day, _, _) in assign.items():
        s = ds.sessions[sid]
        w = out.setdefault(s["faculty_id"], {"hours": 0, "sessions": 0, "by_day": {d: 0 for d in ds.days}})
        w["hours"] += s["duration"]
        w["sessions"] += 1
        w["by_day"][day] += s["duration"]
    return out


class WorkloadArgs(BaseModel):
    faculty: str | None = Field(None, description="One faculty member; empty for everyone you may see")
    department: str | None = None


@tool("get_faculty_workload", "Teaching hours and sessions per week for faculty, with the busiest day against "
      "their daily limit. Faculty see their own; coordinators their department.", WorkloadArgs, roles=TEACHING)
def get_faculty_workload(ctx: Ctx, a: WorkloadArgs) -> Out:
    row, ds, v = _need_version(ctx)
    w = workload(ds, state.to_assign(v.assignments))
    u = ctx.user
    ids = list(ds.faculty)
    if a.faculty:
        ids = [_find(ds.faculty, a.faculty, "faculty member")]
    if u.role == "faculty":
        if a.faculty and ids != [u.faculty_id]:
            raise ToolError("Faculty accounts can only see their own workload")
        ids = [u.faculty_id]
    dept = u.department if u.role == "coordinator" else (a.department.upper() if a.department else None)
    if dept:
        ids = [f for f in ids if ds.faculty[f].get("department") == dept]
        if u.role == "coordinator" and not ids:
            raise ToolError(f"Coordinators can only see {u.department} faculty")
    rows = sorted(({"id": f, "name": ds.faculty[f]["name"], "department": ds.faculty[f].get("department"),
                    "hours": w[f]["hours"], "sessions": w[f]["sessions"],
                    "busiest_day": max(w[f]["by_day"].items(), key=lambda kv: kv[1]),
                    "daily_limit": ds.faculty[f].get("max_hours_per_day")} for f in ids), key=lambda r: -r["hours"])
    data = {"faculty": [{**r, "busiest_day": f"{r['busiest_day'][0]} {r['busiest_day'][1]} h"} for r in rows[:20]]}
    top = max([r["hours"] for r in rows] + [1])
    return Out(data, [card("bars", title="Teaching hours per week", unit="h",
                           note="From the active timetable" + (f" · {dept}" if dept else ""),
                           items=[{"label": f"{r['id']} {r['name']}", "value": r["hours"], "max": top,
                                   "sub": f"{r['sessions']} sessions, max {r['busiest_day'][1]} h on "
                                          f"{r['busiest_day'][0]} (limit {r['daily_limit']})"} for r in rows[:12]])],
               memory={"faculty_id": ids[0]} if len(ids) == 1 else {})


@tool("generate_analytics_report", "A campus operations report from the database: timetable health, room "
      "utilisation, faculty workload, Spectra bookings and exams.", BaseModel, roles=STAFF)
def generate_analytics_report(ctx: Ctx, a: BaseModel) -> Out:
    row, ds, v = _need_version(ctx)
    d = dashboard(db=ctx.db, user=ctx.user)
    util = [_d(u) for u in d.utilisation]
    avg = round(sum(u["pct"] for u in util) / len(util), 1) if util else 0
    w = workload(ds, state.to_assign(v.assignments))
    loads = sorted(((f, x["hours"]) for f, x in w.items()), key=lambda kv: -kv[1])
    fest = _d(d.fest) if d.fest is not None else None
    stats = [{"label": "Sessions placed", "value": f"{d.placed} of {d.total}"},
             {"label": "Hard-rule violations", "value": str(d.hard_count)},
             {"label": "Soft penalty", "value": str(d.soft_total)},
             {"label": "Average room use", "value": f"{avg}%"},
             {"label": "Exams scheduled", "value": f"{d.exams_scheduled} of {d.exams_total}"}]
    if fest:
        stats.append({"label": "Spectra requests", "value": f"{fest['approved']} approved, {fest['alternatives']} moved, "
                                                            f"{fest['rejected']} rejected, {fest['pending']} waiting"})
    data = {"stats": stats, "top_rooms": [(u["room_id"], u["pct"]) for u in sorted(util, key=lambda u: -u["pct"])[:5]],
            "idle_rooms": [u["room_id"] for u in util if u["pct"] == 0], "busiest_faculty": loads[:5],
            "soft_breakdown": d.soft}
    top = sorted(util, key=lambda u: -u["pct"])[:8]
    return Out(data, [card("stats", title="Operations report", items=stats),
                      card("bars", title="Busiest rooms", unit="%", note="Share of teaching hours used",
                           items=[{"label": u["room_id"], "value": u["pct"], "max": 100} for u in top]),
                      card("bars", title="Heaviest teaching loads", unit="h", note="Hours per week",
                           items=[{"label": f"{f} {ds.faculty[f]['name']}", "value": h, "max": max(loads[0][1], 1)}
                                  for f, h in loads[:6]])])


# ---------------------------------------------------------------- proposals and simulation
class ProposalArgs(BaseModel):
    proposal_id: int | None = None


def _compare_card(ds: Dataset, title: str, status: str, info: dict) -> dict:
    def at(x: dict | None) -> str:
        return f"{DAY.get(x['day'], x['day'])[:3]} {_time(ds, x['start'], 1).split('–')[0]} {x['room']}" if x else ""
    rows = [{"session": m["session_id"], "course": f"{m['course_id']} {m['kind']}", "groups": ", ".join(m["groups"]),
             "before": at(m["before"]) or "—", "after": at(m["after"]) or "removed"}
            for m in info.get("diff", [])]
    return card("compare", title=title, status=status, moved=info.get("moved", 0),
                soft_before=info.get("soft_before"), soft_after=info.get("soft_after"),
                proven_minimal=info.get("proven_minimal", False), rows=rows, conflicts=info.get("conflicts", []))


@tool("list_change_proposals", "Timetable change proposals (disruption repairs, faculty requests, manual moves): "
      "status and what each one moves. Non-admins see their own.", ProposalArgs, roles=TEACHING)
def list_change_proposals(ctx: Ctx, a: ProposalArgs) -> Out:
    ps = [proposals.to_out(ctx.db, p, ctx.user) for p in proposals.visible(ctx.db, ctx.user)]
    if a.proposal_id is not None:
        one = next((p for p in ps if p["id"] == a.proposal_id), None)
        if not one:
            raise ToolError(f"No proposal #{a.proposal_id} among the ones you can see")
        return Out(_proposal(one) | {"conflicts": one["conflicts"]}, [card("proposals", items=[_proposal(one)], detail=True)],
                   memory={"proposal_id": a.proposal_id})
    items = [_proposal(p) for p in ps[:8]]
    return Out({"count": len(ps), "proposals": items}, [card("proposals", items=items, detail=False)] if items else [])


@tool("compare_schedule_versions", "Before and after for a change proposal: every session it moves, against the "
      "active timetable, with the soft penalty before and after.", ProposalArgs, roles=TEACHING)
def compare_schedule_versions(ctx: Ctx, a: ProposalArgs) -> Out:
    if a.proposal_id is None:
        raise ToolError("Say which proposal to compare, like #3")
    ps = {p.id: p for p in proposals.visible(ctx.db, ctx.user)}
    if a.proposal_id not in ps:
        raise ToolError(f"No proposal #{a.proposal_id} among the ones you can see")
    _, ds = state.active_dataset(ctx.db)
    o = proposals.to_out(ctx.db, ps[a.proposal_id], ctx.user)
    data = {k: o[k] for k in ("id", "title", "status", "stale", "moved", "time_changed", "room_only", "soft_before",
                              "soft_after", "proven_minimal", "conflicts")} | {"diff": o["diff"][:25]}
    return Out(data, [_compare_card(ds, f"#{o['id']} {o['title']}", o["status"], o)], memory={"proposal_id": o["id"]})


class DisruptionArgs(BaseModel):
    type: Literal["faculty_unavailable", "room_unavailable"]
    faculty: str | None = None
    room: str | None = None
    days: list[str] = Field(min_length=1)
    periods: list[int] = Field(default_factory=lambda: list(range(1, LAST_TEACHING + 1)))
    reason: str = ""


def _change_file(ctx: Ctx, ds: Dataset, a: DisruptionArgs) -> dict:
    days = [_day(ds, d) for d in a.days]
    periods = sorted({p for p in a.periods if 1 <= p <= MAX_PERIOD})
    if not periods:
        raise ToolError("Say which periods")
    if a.type == "faculty_unavailable":
        fid = _find(ds.faculty, a.faculty, "faculty member") if a.faculty else ctx.user.faculty_id
        if not fid:
            raise ToolError("Say which faculty member")
        if ctx.user.role == "faculty" and fid != ctx.user.faculty_id:
            raise ToolError("You can only report your own unavailability")
        if ctx.user.role == "coordinator" and ds.faculty[fid].get("department") != ctx.user.department:
            raise ToolError(f"Coordinators can only plan for {ctx.user.department} faculty")
        return {"changes": [{"type": "faculty_unavailable", "faculty_id": fid, "days": days, "periods": periods,
                             "reason": a.reason or "Velo simulation"}]}
    if ctx.user.role not in STAFF:
        raise ToolError("Only coordinators and the Admin can plan room closures")
    if not a.room:
        raise ToolError("Say which room")
    rid = _find(ds.rooms, a.room, "room")
    return {"changes": [{"type": "room_unavailable", "room_id": rid, "days": days, "periods": periods,
                         "reason": a.reason or "Velo simulation"}]}


def _affected(ds: Dataset, assign, change: dict) -> list[str]:
    days, periods = set(change["days"]), set(change["periods"])
    out = []
    for sid, (day, s0, room) in assign.items():
        s = ds.sessions[sid]
        hit = s["faculty_id"] == change.get("faculty_id") if change["type"] == "faculty_unavailable" else room == change.get("room_id")
        if hit and day in days and periods & set(block(s0, s["duration"])):
            out.append(sid)
    return sorted(out)


@tool("simulate_disruption", "What-if: a faculty member unavailable or a room closed. Runs the same repair solver as "
      "a real proposal (fewest moves, every hard rule kept) and shows before/after. Saves nothing.",
      DisruptionArgs, roles=TEACHING, kind="simulate")
def simulate_disruption(ctx: Ctx, a: DisruptionArgs) -> Out:
    row, ds, v = _need_version(ctx)
    cf = _change_file(ctx, ds, a)
    hit = _affected(ds, state.to_assign(v.assignments), cf["changes"][0])
    try:
        info = proposals.dry_run(ctx.db, ds, v, cf)
    except ApiError as e:
        raise ToolError(e.message) from e
    data = {"change": cf["changes"][0], "directly_affected_sessions": hit} | {
        k: info[k] for k in ("status", "moved", "time_changed", "room_only", "soft_before", "soft_after",
                             "proven_minimal", "conflicts")} | {"diff": info["diff"][:25]}
    ch = cf["changes"][0]
    who = ds.faculty[ch["faculty_id"]]["name"] if ch.get("faculty_id") else f"{ch['room_id']} is closed"
    days = ", ".join(DAY[d] for d in ch["days"])
    title = f"What if {who} is away {days}" if ch.get("faculty_id") else f"What if {who} {days}"
    return Out(data, [_compare_card(ds, title, info["status"], info)])


# ---------------------------------------------------------------- actions (pending until confirmed)
def _pending(ctx: Ctx, tool_name: str, args: dict, title: str, lines: list[dict], warnings: list[str],
             base_version: int | None, confirm: str) -> dict:
    a = VeloAction(id="act_" + secrets.token_urlsafe(12), user_id=ctx.user.id, conversation_id=ctx.conversation_id,
                   tool=tool_name, args=args, base_version=base_version,
                   preview={"title": title, "lines": lines, "warnings": warnings, "confirm": confirm},
                   expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.velo_action_ttl_min))
    ctx.db.add(a)
    ctx.db.flush()
    state.audit(ctx.db, ctx.user, "velo.prepare", a.id, {"tool": tool_name, "args": args})
    return card("action", id=a.id, tool=tool_name, title=title, lines=lines, warnings=warnings, confirm=confirm,
                status="pending", expires_at=a.expires_at.isoformat())


class DraftArgs(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    day: str
    from_period: int = Field(ge=1, le=MAX_PERIOD, description="First period of the window the event may use")
    to_period: int = Field(ge=1, le=MAX_PERIOD, description="Last period of that window")
    duration_periods: int | None = Field(None, ge=1, le=MAX_PERIOD, description="Hours needed; default the whole window")
    attendance: int = Field(ge=1, le=100000)
    needs: list[str] = Field(default_factory=list)
    room_types: list[str] = Field(default_factory=list)
    requested_room: str | None = None
    category: Literal["institute_event", "guest_lecture", "department_event", "club_event"] | None = None
    mandatory_for_groups: list[str] = Field(default_factory=list)
    week: Week | None = Field(None, description="The week the person named: spectra for Spectra week (Week 7), "
                              "regular for a normal week. Leave it empty unless they said; the tool then asks.")


def _draft(ctx: Ctx, ds: Dataset, a: DraftArgs) -> dict:
    day = _day(ds, a.day)
    if a.to_period < a.from_period:
        raise ToolError("The window ends before it starts")
    dur = a.duration_periods or (a.to_period - a.from_period + 1)
    if dur > a.to_period - a.from_period + 1:
        raise ToolError("The event is longer than the window it may use")
    room = _find(ds.rooms, a.requested_room, "room") if a.requested_room else None
    types = [t for t in a.room_types if any(r["type"] == t for r in ds.rooms.values())]
    if room and ds.rooms[room]["type"] not in types:
        types.append(ds.rooms[room]["type"])
    if not types:
        labs = ("lab_cs", "lab_elec", "lab_phy", "lab_civil", "workshop")
        types = sorted({x["type"] for x in ds.rooms.values() if "event" in x["allowed_uses"]
                        and not set(a.needs) - _room_feats(x) and x["capacity"] >= a.attendance
                        and (x["type"] not in labs or "computers" in a.needs)})
    if not types:
        raise ToolError(f"No bookable room fits {a.attendance} people with {', '.join(a.needs) or 'those needs'}")
    groups = [_find(ds.groups, g, "student group") for g in a.mandatory_for_groups]
    return {"title": a.title, "attendance": a.attendance, "duration_periods": dur,
            "windows": [{"day": day, "from_period": a.from_period, "to_period": a.to_period}], "room_types": types,
            "needs": a.needs, "requested_room": room, "mandatory_for_groups": groups,
            "requested_category": a.category or ROLE_DEFAULT[ctx.user.role], "repeat_days": [], "raw_text": None}


@tool("create_booking_draft", "Validate a venue booking with the real rule checker and prepare it for the person "
      "to confirm. Use only when the person asks to book or reserve. Nothing is sent until they press Confirm.",
      DraftArgs, kind="action")
def create_booking_draft(ctx: Ctx, a: DraftArgs) -> Out:
    row, ds, v = _need_version(ctx)
    d = _draft(ctx, ds, a)
    mem = {"day": d["windows"][0]["day"], "from_period": a.from_period, "to_period": a.to_period,
           "attendance": a.attendance, "room_id": d["requested_room"],
           "draft": a.model_dump(exclude_defaults=True)}      # the whole draft, so "add a projector" can change it
    if a.week is None:
        return Out({"week_needed": True, "ask": "Ask whether this is for Spectra week (Week 7) or a regular week. "
                    "Venue requests can only be sent for Spectra week; for a regular week you can show the free rooms."},
                   memory=mem)
    if a.week == "regular":
        out = find_available_rooms(ctx, FreeArgs(day=a.day, from_period=a.from_period,
                                                 to_period=a.from_period + d["duration_periods"] - 1,
                                                 capacity=a.attendance, needs=a.needs, room_types=a.room_types,
                                                 week="regular"))
        out.data.update(bookable=False, note="Venue requests can only be sent for Spectra week (Week 7), so a "
                        "regular week can't be booked. These rooms are free then in the normal timetable. Offer to "
                        "make it a Spectra week request.")
        out.cards[0]["data"]["bookable"] = False        # a regular week can't be booked, so no Book buttons
        out.memory = mem
        return out
    chk = bookings.check(ctx.db, ds, v, d, ctx.user)
    place = chk.get("placement") or {}
    for x in [place] + chk["alternatives"]:
        if x and x.get("day") and x.get("start_period"):
            x["when"] = when(ds, x["day"], x["start_period"], x["end_period"])
    data = {"draft": d, "valid": chk["valid"], "category": chk["category"], "category_note": chk["category_note"],
            "would_be": place.get("status"), "placed": {k: place.get(k) for k in ("room_id", "when", "reason")},
            "violations": chk["violations"], "alternatives": [{k: x[k] for k in ("room_id", "when")} for x in chk["alternatives"]]}
    if not chk["valid"] or not place.get("room_id"):
        data["sendable"] = False
        return Out(data, [card("preview", draft=d, guessed=[], notes=[], check=chk)], memory=mem)
    lines = [{"label": "Event", "value": d["title"]},
             {"label": "When", "value": when(ds, d["windows"][0]["day"], a.from_period, a.to_period)
              + (f" ({d['duration_periods']} h)" if d["duration_periods"] < a.to_period - a.from_period + 1 else "")},
             {"label": "People", "value": str(d["attendance"])},
             {"label": "Checker", "value": f"{STATUS.get(place['status'], place['status'])}: {place['room_id']}, {place.get('when', '')}"},
             {"label": "Category", "value": chk["category"].replace("_", " ")}]
    if d["needs"]:
        lines.insert(3, {"label": "Needs", "value": ", ".join(n.replace("_", " ") for n in d["needs"])})
    warnings = [x for x in [chk["category_note"]] + chk["violations"] if x]
    data["sendable"] = True
    return Out(data, [_pending(ctx, "submit_booking", {"draft": d}, "Send this booking request?", lines, warnings,
                               v.id, "Send request")], memory=mem)


class CancelArgs(BaseModel):
    request_id: str


@tool("cancel_booking", "Prepare cancelling one of the person's booking requests. It is cancelled only when they "
      "press Confirm.", CancelArgs, kind="action")
def cancel_booking(ctx: Ctx, a: CancelArgs) -> Out:
    row, ds, v = _ds(ctx)
    rid = a.request_id.upper()
    try:
        r = bookings.get_request(ctx.db, ds, v, ctx.user, rid)
    except ApiError as e:
        raise ToolError(e.message) from e
    if not r["can_cancel"]:
        raise ToolError(f"{rid} can't be cancelled: it is {STATUS.get(r['status'], r['status'])} or isn't yours")
    item = _request_row(ds, r)
    lines = [{"label": "Request", "value": f"{rid} {r['title']}"},
             {"label": "Now", "value": STATUS.get(r["status"], r["status"]) + (f", {item['room']} {item['when']}" if item["when"] else "")}]
    return Out({"request": item, "pending_confirmation": True},
               [_pending(ctx, "cancel_booking", {"request_id": rid}, f"Cancel {rid}?", lines,
                         ["Its slot is freed and the other Spectra requests are re-decided."], None, "Cancel request")],
               memory={"request_id": rid})


class ChangeArgs(BaseModel):
    type: Literal["move_session", "faculty_unavailable"]
    session_id: str | None = None
    day: str | None = Field(None, description="move_session: target day")
    start_period: int | None = Field(None, ge=1, le=LAST_TEACHING)
    room: str | None = Field(None, description="move_session: target room; empty keeps the current room")
    faculty: str | None = None
    days: list[str] = Field(default_factory=list, description="faculty_unavailable: days")
    periods: list[int] = Field(default_factory=list)
    reason: str = ""


@tool("create_change_proposal", "Prepare a timetable change for Admin approval: move one session (checked against "
      "every hard rule now) or report a faculty member unavailable (the repair solver proposes the fewest moves "
      "when confirmed). Sent only when the person presses Confirm.", ChangeArgs, roles=TEACHING, kind="action")
def create_change_proposal(ctx: Ctx, a: ChangeArgs) -> Out:
    row, ds, v = _need_version(ctx)
    u = ctx.user
    if a.type == "faculty_unavailable":
        if not a.days:
            raise ToolError("Say which days")
        cf = _change_file(ctx, ds, DisruptionArgs(type="faculty_unavailable", faculty=a.faculty, days=a.days,
                                                  periods=a.periods or list(range(1, LAST_TEACHING + 1)), reason=a.reason))
        ch = cf["changes"][0]
        hit = _affected(ds, state.to_assign(v.assignments), ch)
        lines = [{"label": "Faculty", "value": f"{ch['faculty_id']} {ds.faculty[ch['faculty_id']]['name']}"},
                 {"label": "Unavailable", "value": f"{', '.join(DAY[d] for d in ch['days'])}, P{min(ch['periods'])}–P{max(ch['periods'])}"},
                 {"label": "Sessions affected", "value": ", ".join(hit) or "none"}]
        return Out({"change": ch, "affected_sessions": hit, "pending_confirmation": True},
                   [_pending(ctx, "create_change_proposal", {"change_file": cf, "title": f"{ch['faculty_id']} unavailable"
                                                             + (f": {a.reason}" if a.reason else "")},
                             "Ask for this change?", lines,
                             ["The repair solver proposes the fewest moves; the Admin approves before anything changes."],
                             v.id, "Send to Admin")])
    sid = (a.session_id or "").upper()
    if sid not in ds.sessions:
        raise ToolError("Say which session to move, by its id (explain_scheduling_decision finds it)")
    s = ds.sessions[sid]
    if u.role == "faculty" and s["faculty_id"] != u.faculty_id:
        raise ToolError("You can only move your own sessions")
    if u.role == "coordinator" and course_dept(ds, sid) != u.department:
        raise ToolError(f"Coordinators can only move {u.department} sessions")
    if not a.day or not a.start_period:
        raise ToolError("Say the day and start period to move it to")
    assign = state.to_assign(v.assignments)
    day = _day(ds, a.day)
    room = _find(ds.rooms, a.room, "room") if a.room else assign[sid][2]
    _, viol = proposals.check_manual(ds, v, sid, day, a.start_period, room)
    if viol:
        sug = proposals.suggestions(ds, assign, sid)
        return Out({"valid": False, "violations": [x.detail for x in viol], "valid_alternatives": sug},
                   [card("stats", title=f"{sid} can't move there", items=[{"label": x.rule, "value": x.detail} for x in viol])])
    before = assign[sid]
    lines = [{"label": "Session", "value": f"{sid} {s['course_id']} {s['kind']} ({', '.join(s['groups'])})"},
             {"label": "From", "value": f"{when(ds, before[0], before[1], before[1] + s['duration'] - 1)}, {before[2]}"},
             {"label": "To", "value": f"{when(ds, day, a.start_period, a.start_period + s['duration'] - 1)}, {room}"},
             {"label": "Hard rules", "value": "all pass"}]
    return Out({"valid": True, "pending_confirmation": True, "session": sid},
               [_pending(ctx, "create_change_proposal",
                         {"move": {"session_id": sid, "day": day, "start": a.start_period, "room": room},
                          "reason": a.reason}, "Ask the Admin for this move?", lines,
                         ["The Admin approves it before the timetable changes."], v.id, "Send to Admin")],
               memory={"session_id": sid})


class DecideArgs(BaseModel):
    kind: Literal["booking", "change"]
    id: str
    decision: Literal["approve", "reject"]
    note: str = ""


@tool("decide_request", "Prepare approving or rejecting a booking request or a change proposal that is waiting for "
      "this person. Decided only when they press Confirm.", DecideArgs, roles=STAFF, kind="action")
def decide_request(ctx: Ctx, a: DecideArgs) -> Out:
    row, ds, v = _need_version(ctx)
    items = {(i["kind"], str(i["id"]).upper()): i for i in pending_for(ctx.db, ctx.user, v)}
    key = (a.kind, a.id.upper().lstrip("#"))
    if key not in items:
        raise ToolError(f"{a.id} is not waiting for your decision")
    i = items[key]
    lines = [{"label": "Item", "value": f"{'#' if a.kind == 'change' else ''}{key[1]} {i['title']}"},
             {"label": "From", "value": str(i["requested_by"])},
             {"label": "Decision", "value": a.decision}]
    if a.note:
        lines.append({"label": "Note", "value": a.note})
    return Out({"item": {k: i[k] for k in ("kind", "id", "title", "requested_by")}, "pending_confirmation": True},
               [_pending(ctx, "decide_request", {"kind": a.kind, "id": key[1], "decision": a.decision, "note": a.note},
                         f"{a.decision.capitalize()} {key[1]}?", lines, [], v.id if a.kind == "change" else None,
                         a.decision.capitalize())])


# ---------------------------------------------------------------- navigation
class NavArgs(BaseModel):
    page: Literal["overview", "timetable", "exams", "spectra", "changes", "approvals", "rooms", "book", "data", "settings"]


@tool("navigate_to_page", "Open a page of the app for the person.", NavArgs, kind="navigate")
def navigate_to_page(ctx: Ctx, a: NavArgs) -> Out:
    path = PAGES[a.page]
    if path not in ROLE_PAGES[ctx.user.role]:
        raise ToolError(f"This account doesn't have the {PAGE_LABEL[path]} page")
    return Out({"opened": PAGE_LABEL[path]}, [card("navigate", path=path, label=PAGE_LABEL[path])], navigate=path)


# ---------------------------------------------------------------- the permission layer
def offered(user: User) -> list[Tool]:
    return [t for t in TOOLS.values() if user.role in t.roles]


def _lean(node):
    """Pydantic's JSON schema minus what the model doesn't need (titles, defaults, null branches), so every
    round costs fewer tokens: free model tiers cap tokens per minute."""
    if isinstance(node, list):
        return [_lean(x) for x in node]
    if not isinstance(node, dict):
        return node
    if "anyOf" in node:
        kept = [x for x in node["anyOf"] if x.get("type") != "null"]
        if len(kept) == 1:
            node = {**{k: v for k, v in node.items() if k != "anyOf"}, **kept[0]}
    drop = ("title", "default", "minimum", "maximum", "minLength", "maxLength", "minItems")
    return {k: _lean(v) for k, v in node.items() if k not in drop}


def schema(t: Tool) -> dict:
    params = t.args.model_json_schema() if t.args is not BaseModel else {"type": "object", "properties": {}}
    return {"type": "function", "function": {"name": t.name, "description": t.description, "parameters": _lean(params)}}


def run(ctx: Ctx, name: str, raw: dict) -> Out:
    """Validate, authorise and execute one tool call. Never raises for the model's mistakes: problems come back
    as {"error": ...} so the model can explain them or ask."""
    t = TOOLS.get(name)
    if t is None:
        return Out({"error": f"There is no tool called {name}"})
    if ctx.user.role not in t.roles:
        state.audit(ctx.db, ctx.user, "velo.denied", name, {"args": raw})
        return Out({"error": f"Not permitted: a {ctx.user.role} account can't use {name}"})
    try:
        args = t.args.model_validate(raw or {}) if t.args is not BaseModel else BaseModel()
    except ValidationError as e:
        problems = "; ".join(f"{'.'.join(str(x) for x in err['loc']) or 'arguments'}: {err['msg']}" for err in e.errors()[:4])
        return Out({"error": f"Invalid arguments for {name}: {problems}"})
    try:
        return t.fn(ctx, args)
    except ToolError as e:
        return Out({"error": str(e)})
    except ApiError as e:
        return Out({"error": e.message})


# ---------------------------------------------------------------- confirm
def confirm(db: Session, user: User, action_id: str) -> dict:
    """Run a prepared action once. A second confirm returns the first result; an expired action, or one prepared
    against a timetable that has changed since, is refused."""
    a = db.get(VeloAction, action_id)
    if a is None or a.user_id != user.id:
        raise not_found("No such action")
    if a.status == "done":
        return {"status": "done", "result": a.result, "repeat": True}
    if a.status != "pending":
        raise conflict(f"This action is {a.status} and can't be confirmed")
    expires = a.expires_at if a.expires_at.tzinfo else a.expires_at.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        a.status = "expired"
        db.commit()
        raise conflict("This action expired. Ask Velo again to get a fresh one.")
    row, ds = state.active_dataset(db)
    v = state.active_version(db, row)
    if a.base_version is not None and (v is None or v.id != a.base_version):
        a.status = "stale"
        db.commit()
        raise conflict("The timetable changed after this was prepared. Ask Velo again so it is re-checked.",
                       {"code": "stale"})
    # claim it: only one confirm can move it out of pending, so a double click can't run it twice
    claimed = db.execute(update(VeloAction).where(VeloAction.id == a.id, VeloAction.status == "pending")
                         .values(status="running")).rowcount
    if not claimed:
        raise conflict("This action is already being confirmed")
    try:
        result = _execute(db, user, ds, row, v, a)
    except ApiError:
        db.rollback()
        db.execute(update(VeloAction).where(VeloAction.id == action_id).values(status="failed"))
        state.audit(db, user, "velo.failed", action_id, {"tool": a.tool})
        db.commit()
        raise
    db.execute(update(VeloAction).where(VeloAction.id == action_id).values(status="done", result=result))
    state.audit(db, user, "velo.confirm", action_id, {"tool": a.tool, "result": result})
    db.commit()
    return {"status": "done", "result": result, "repeat": False}


def _execute(db: Session, user: User, ds: Dataset, row, v, a: VeloAction) -> dict:
    if a.tool == "submit_booking":
        if v is None:
            raise conflict("No timetable is active")
        ids = bookings.submit(db, ds, v, a.args["draft"], user)
        mine = {r["id"]: r for r in bookings.list_requests(db, ds, v, user, mine=True)}
        return {"message": f"Sent {', '.join(ids)}.", "request_ids": ids,
                "items": [_request_row(ds, mine[i]) for i in ids if i in mine]}
    if a.tool == "cancel_booking":
        bookings.cancel(db, ds, v, a.args["request_id"], user)
        return {"message": f"Cancelled {a.args['request_id']}.", "request_ids": [a.args["request_id"]]}
    if a.tool == "create_change_proposal":
        if user.role not in TEACHING:
            raise forbidden("This account can't ask for timetable changes")
        if "move" in a.args:
            m = a.args["move"]
            _, viol = proposals.check_manual(ds, v, m["session_id"], m["day"], m["start"], m["room"])
            if viol:
                raise conflict(f"The move no longer passes the hard-rule check ({viol[0].detail})")
            p = proposals.from_move(db, row, ds, v, m["session_id"], m["day"], m["start"], m["room"], "request",
                                    f"Move {m['session_id']} to {m['day']} P{m['start']} {m['room']}", user,
                                    a.args.get("reason", ""))
        else:
            p = proposals.from_changes(db, row, ds, v, a.args["change_file"], "unavailability" if user.role == "faculty"
                                       else "request", a.args["title"], user)
        return {"message": f"Proposal #{p.id} is {'waiting for the Admin' if p.status == 'pending' else p.status}.",
                "proposal_id": p.id, "status": p.status}
    if a.tool == "decide_request":
        if a.args["kind"] == "booking":
            bookings.decide(db, ds, v, a.args["id"], user, a.args["decision"], a.args.get("note", ""))
        else:
            p = proposals.get(db, int(a.args["id"]))
            (proposals.approve if a.args["decision"] == "approve" else proposals.reject)(db, p, user, a.args.get("note", ""))
        verb = "Approved" if a.args["decision"] == "approve" else "Rejected"
        return {"message": f"{verb} {a.args['id']}."}
    raise bad_request(f"Unknown action {a.tool}")


def discard(db: Session, user: User, action_id: str) -> dict:
    a = db.get(VeloAction, action_id)
    if a is None or a.user_id != user.id:
        raise not_found("No such action")
    if a.status == "pending":
        a.status = "discarded"
        state.audit(db, user, "velo.discard", action_id, {"tool": a.tool})
        db.commit()
    return {"status": a.status}
