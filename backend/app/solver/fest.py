"""Spectra week (Week 7) booking decisions.

Requests are placed one at a time in priority order (effective category, then submitted_at). A request
is never left out of a slot that a lower-priority request later takes, so the result has no priority
inversions by construction; check_fest verifies it anyway.
"""
from dataclasses import dataclass, field

from ..core.checker import _booking_errors, _room_busy, _room_feats, group_busy
from ..core.model import MAX_PERIOD, Assign, Dataset, block
from ..core.priority import effective_category, priority_key
from .timetable import solve_timetable

MAX_DISPLACE_ATTEMPTS = 3   # full re-solves tried per institute event before offering an alternative

CAT_LABEL = {"institute_event": "institute event", "guest_lecture": "guest lecture",
             "department_event": "department event", "club_event": "club event"}


@dataclass
class Decision:
    request_id: str
    status: str
    day: str | None = None
    start_period: int | None = None
    end_period: int | None = None
    room_id: str | None = None
    reason: str = ""
    facts: list[str] = field(default_factory=list)
    lost_to: str | None = None
    displaces: list[str] = field(default_factory=list)


@dataclass
class FestResult:
    decisions: list[Decision]
    overrides: list[dict]


def _span(ds: Dataset, day, a, b) -> str:
    periods = {p["id"]: p for p in ds.calendar.get("periods", [])}
    start = periods[a]["start"] if a in periods else f"P{a}"
    end = periods[b]["end"] if b in periods else f"P{b}"
    return f"{day} {start}–{end}"


class _State:
    def __init__(self, ds: Dataset, assign: Assign):
        self.ds = ds
        self.base = assign
        self.week = dict(assign)
        self.overrides: dict[str, dict] = {}
        self.placed: dict[str, tuple[str, str, int, int]] = {}   # req id -> (room, day, a, b)
        self.refresh()

    def refresh(self):
        self.busy = _room_busy(self.ds, self.week)
        for rid_, (room, day, a, b) in self.placed.items():
            for p in range(a, b + 1):
                self.busy[(room, day, p)].append(rid_)
        self.grp = group_busy(self.ds, self.week)

    def fits(self, req, room, day, a, b, approved=True) -> list[str]:
        d = {"room_id": room, "day": day, "start_period": a, "end_period": b}
        return _booking_errors(self.ds, req, d, self.busy, self.grp, approved)

    def take(self, req_id, room, day, a, b):
        self.placed[req_id] = (room, day, a, b)
        for p in range(a, b + 1):
            self.busy[(room, day, p)].append(req_id)


def _ordered_rooms(ds, req) -> list[dict]:
    ok = [r for r in ds.rooms.values()
          if "event" in r["allowed_uses"] and r["type"] in req["room_types"]
          and r["capacity"] >= req["attendance"] and not set(req["needs"]) - _room_feats(r)]
    ok.sort(key=lambda r: (r["id"] != req.get("requested_room"), r["capacity"], r["id"]))
    return ok


def _window_starts(req):
    dur = req["duration_periods"]
    for w in req["windows"]:
        for a in range(w["from_period"], min(w["to_period"], MAX_PERIOD) - dur + 2):
            yield w["day"], a, a + dur - 1


def _alternative_starts(ds, req):
    """Every (day, a, b) outside the windows, nearest to the first window first."""
    dur = req["duration_periods"]
    w0 = req["windows"][0] if req["windows"] else {"day": ds.days[0], "from_period": 1}
    inside = set(_window_starts(req))
    out = []
    for day in ds.days:
        for a in range(1, MAX_PERIOD - dur + 2):
            if (day, a, a + dur - 1) not in inside:
                dist = (0 if day == w0["day"] else 1 + abs(ds.days.index(day) - ds.days.index(w0["day"])) if w0["day"] in ds.days else 9,
                        abs(a - w0["from_period"]))
                out.append((dist, day, a, a + dur - 1))
    return [(d, a, b) for _, d, a, b in sorted(out)]


def _holders(st: _State, room, day, a, b) -> list[str]:
    return sorted({h for p in range(a, b + 1) for h in st.busy[(room, day, p)]})


def _describe_holder(ds, all_reqs, h) -> str:
    if h in all_reqs:
        r = all_reqs[h]
        return f"{h} ({CAT_LABEL.get(effective_category(ds, r), r['requested_category'])})"
    s = ds.sessions.get(h)
    return f"class {h}" if s else h


def _try_displace(ds, st: _State, req, req_id, rooms, time_limit_s, all_reqs) -> Decision | None:
    """Institute events may move regular classes for Week 7. Pick the window slot whose only
    conflicts are classes, re-place those classes, and keep every earlier booking fixed."""
    options = []
    for day, a, b in _window_starts(req):
        for r in rooms:
            errs = st.fits(req, r["id"], day, a, b)
            holders = _holders(st, r["id"], day, a, b)
            if not holders or any(h in st.placed for h in holders):
                continue
            if any("already used by" not in e for e in errs):
                continue
            options.append((len(holders), day, a, b, r, holders))
    options.sort(key=lambda o: o[0])        # fewest classes to move first; ties keep window/room order
    for _, day, a, b, r, holders in options[:MAX_DISPLACE_ATTEMPTS]:
        blocked = {(room, d, p) for room, d, x, y in list(st.placed.values()) + [(r["id"], day, a, b)]
                   for p in range(x, y + 1)}
        groups = {(g, d, p) for rq, (room, d, x, y) in list(st.placed.items()) + [(req_id, (r["id"], day, a, b))]
                  for g in all_reqs[rq].get("mandatory_for_groups", []) for p in range(x, y + 1)}
        res = solve_timetable(ds, time_limit_s, baseline=st.base, move_weight=1000, blocked=blocked,
                              blocked_groups=groups)
        if res.assign is None:
            continue
        saved = (st.week, st.overrides)
        st.week = res.assign
        st.overrides = {sid: {"session_id": sid, "day": v[0], "start_period": v[1], "room_id": v[2],
                              "displaced_by": st.overrides.get(sid, {}).get("displaced_by", req_id)}
                        for sid, v in res.assign.items() if tuple(v) != tuple(st.base[sid])}
        st.refresh()
        if st.fits(req, r["id"], day, a, b):
            st.week, st.overrides = saved
            st.refresh()
            continue
        st.take(req_id, r["id"], day, a, b)
        moved = sorted(sid for sid, o in st.overrides.items() if o["displaced_by"] == req_id)
        return Decision(req_id, "approved", day, a, b, r["id"],
                        reason=f"Institute event: {r['id']} {_span(ds, day, a, b)}; "
                               f"{len(moved)} class(es) moved for Week 7 only",
                        facts=[f"{h} was in {r['id']} at that time" for h in holders], displaces=moved)
    return None


def decide_fest(ds: Dataset, assign: Assign, extra_requests: list[dict] = (), time_limit_s: float = 30) -> FestResult:
    all_reqs = {**ds.requests, **{r["id"]: r for r in extra_requests}}
    st = _State(ds, assign)
    decisions: dict[str, Decision] = {}
    cancel_note = {c["request_id"]: c.get("note", "") for c in ds.raw.get("cancellations", [])}

    for rid in ds.cancelled & set(all_reqs):
        note = cancel_note.get(rid)
        decisions[rid] = Decision(rid, "rejected", reason=f"Cancelled by requester{': ' + note if note else ''}")

    queue = sorted((r for i, r in all_reqs.items() if i not in ds.cancelled), key=lambda r: priority_key(ds, r))
    for req in queue:
        rid = req["id"]
        cat = effective_category(ds, req)
        facts = []
        if cat != req.get("requested_category"):
            facts.append(f"Asked for {CAT_LABEL.get(req.get('requested_category'), req.get('requested_category'))}; "
                         f"a {str(req.get('role', 'requester')).replace('_', ' ')} can claim at most {CAT_LABEL[cat]}")
        want = req.get("requested_room")
        if want and want not in ds.rooms:
            facts.append(f"Requested room {want} does not exist")
        for w in req["windows"]:
            if w["to_period"] > MAX_PERIOD:
                facts.append(f"Window {w['day']} P{w['from_period']}–P{w['to_period']} runs past 22:00; P{MAX_PERIOD} is the last period")
        rooms = _ordered_rooms(ds, req)
        if not rooms:
            decisions[rid] = Decision(rid, "rejected", reason=_no_room_reason(ds, req), facts=facts)
            continue
        if want in ds.rooms and want not in {r["id"] for r in rooms}:
            facts.append(f"Requested {want} does not fit: {_room_misfit(ds, req, ds.rooms[want])}")

        d = _place_in_window(ds, st, req, rid, rooms, facts, all_reqs)
        if d is None and cat == "institute_event" and rid in ds.requests:
            # live app requests never move classes: the export's overrides must name a dataset request
            d = _try_displace(ds, st, req, rid, rooms, time_limit_s, all_reqs)
            if d:
                d.facts = facts + d.facts
        if d is None:
            d = _place_alternative(ds, st, req, rid, rooms, facts, all_reqs)
        decisions[rid] = d

    order = list(ds.requests) + [r["id"] for r in extra_requests]
    overrides = sorted(st.overrides.values(), key=lambda o: o["session_id"])
    return FestResult([decisions[i] for i in order if i in decisions], overrides)


def _place_in_window(ds, st, req, rid, rooms, facts, all_reqs) -> Decision | None:
    for day, a, b in _window_starts(req):
        for r in rooms:
            if not st.fits(req, r["id"], day, a, b):
                st.take(rid, r["id"], day, a, b)
                reason = f"Approved: {r['id']} {_span(ds, day, a, b)}"
                want = req.get("requested_room")
                lost = None
                if want in ds.rooms and want != r["id"]:
                    holders = [h for h in _holders(st, want, day, a, b) if h != rid]
                    if holders:
                        lost = holders[0]
                        reason += f" (requested {want} is held by {_describe_holder(ds, all_reqs, holders[0])})"
                    else:
                        reason += f" (requested {want} is not suitable)"
                return Decision(rid, "approved", day, a, b, r["id"], reason=reason, facts=facts, lost_to=lost)
    return None


def _place_alternative(ds, st, req, rid, rooms, facts, all_reqs) -> Decision:
    blocker, why = _window_blocker(ds, st, req, rooms, all_reqs)
    for day, a, b in _alternative_starts(ds, req):
        for r in rooms:
            if not st.fits(req, r["id"], day, a, b, approved=False):
                st.take(rid, r["id"], day, a, b)
                return Decision(rid, "alternative_offered", day, a, b, r["id"],
                                reason=f"{why}; nearest free option is {r['id']} {_span(ds, day, a, b)}",
                                facts=facts, lost_to=blocker)
    return Decision(rid, "rejected", reason=f"{why}, and no other time this week has a suitable room free",
                    facts=facts, lost_to=blocker)


def _window_blocker(ds, st, req, rooms, all_reqs) -> tuple[str | None, str]:
    """Plain-language reason nothing fits inside the requested windows."""
    starts = list(_window_starts(req))
    if not starts:
        return None, "None of the requested times fall inside the bookable periods (08:00–22:00)"
    day, a, b = starts[0]
    holders_by_room = {r["id"]: _holders(st, r["id"], day, a, b) for r in rooms}
    for r in rooms:
        hs = holders_by_room[r["id"]]
        reqs = [h for h in hs if h in all_reqs]
        if reqs:
            top = min(reqs, key=lambda h: priority_key(ds, all_reqs[h]))
            return top, f"{r['id']} {_span(ds, day, a, b)} is taken by {_describe_holder(ds, all_reqs, top)}, which has priority"
        if hs:
            return None, f"{r['id']} {_span(ds, day, a, b)} has regular classes ({', '.join(hs[:3])}), which only institute events may move"
    for g in req["mandatory_for_groups"]:
        if any(st.grp.get((g, day, p)) for p in range(a, b + 1)):
            return None, f"It is mandatory for {g}, who have class {_span(ds, day, a, b)}"
    r = rooms[0]
    errs = st.fits(req, r["id"], day, a, b)
    return None, f"No suitable room is free in the requested window ({errs[0] if errs else 'all taken'})"


def _no_room_reason(ds, req) -> str:
    typed = [r for r in ds.rooms.values() if r["type"] in req["room_types"] and "event" in r["allowed_uses"]]
    if not typed:
        return f"No bookable venue of type {', '.join(req['room_types'])}"
    big = max(typed, key=lambda r: r["capacity"])
    if big["capacity"] < req["attendance"]:
        return (f"No venue of type {'/'.join(req['room_types'])} seats {req['attendance']} "
                f"(largest is {big['id']} with {big['capacity']})")
    need = set(req["needs"])
    return f"No {'/'.join(req['room_types'])} venue for {req['attendance']} has all of: {', '.join(sorted(need))}"


def _room_misfit(ds, req, room) -> str:
    if room["type"] not in req["room_types"]:
        return f"it is a {room['type'].replace('_', ' ')}"
    if room["capacity"] < req["attendance"]:
        return f"it seats {room['capacity']}"
    miss = set(req["needs"]) - _room_feats(room)
    if miss:
        return f"it lacks {', '.join(sorted(miss))}"
    return "it cannot host events"
