"""Hard and soft rule checks. Everything that decides validity goes through here.

Rule codes and messages follow starter_pack/validator.py so our reports read the same as the
official one (tests compare the two on random schedules).
"""
from collections import defaultdict
from dataclasses import asdict, dataclass

from .model import LAST_TEACHING, MAX_PERIOD, Assign, Dataset, block
from .priority import CAT_WEIGHT, effective_category, outranks

SOFT_KEYS = ("S1", "S2", "S3", "S4", "S5", "S6")


@dataclass
class Violation:
    rule: str
    where: str
    detail: str


def _room_feats(room: dict) -> set[str]:
    return set(room["features"]) | ({"accessible"} if room["accessible"] else set())


# ---------------------------------------------------------------- timetable
def _placement_errors(ds: Dataset, sid: str, day: str, start, rid: str) -> list[tuple[str, str]]:
    """Rules about one placement on its own (no interaction with other sessions)."""
    s = ds.sessions.get(sid)
    if s is None:
        return [("H1", f"Unknown session id {sid}")]
    if day not in ds.days:
        return [("H1", f"{sid}: invalid day {day}")]
    if not isinstance(start, int) or start < 1 or start + s["duration"] - 1 > LAST_TEACHING:
        return [("H9", f"{sid}: start period {start} with duration {s['duration']} runs outside P1-P9")]
    r = ds.rooms.get(rid)
    if r is None:
        return [("H1", f"{sid}: unknown room {rid}")]
    out = []
    per = block(start, s["duration"])
    if per[0] <= ds.lunch_after < per[-1]:
        out.append(("H9", f"{sid}: crosses lunch ({day} P{per[0]}-P{per[-1]})"))
    if s["kind"] == "lab" and start not in ds.lab_starts:
        out.append(("H9", f"{sid}: lab must start at P2 or P6, starts at P{start}"))
    fx = s.get("fixed_slot")
    if fx and (fx["day"] != day or fx["start_period"] != start):
        out.append(("H14", f"{sid}: fixed at {fx['day']} P{fx['start_period']}, placed at {day} P{start}"))
    if r["capacity"] < s["size"]:
        out.append(("H5", f"{sid}: size {s['size']} > {rid} capacity {r['capacity']}"))
    if r["type"] not in s["room_types"]:
        out.append(("H6", f"{sid}: needs {s['room_types']}, {rid} is {r['type']}"))
    if s.get("needs_accessible") and not r["accessible"]:
        out.append(("H10", f"{sid}: needs an accessible room, {rid} is not"))
    f = s["faculty_id"]
    for p in per:
        if (day, p) in ds.fac_un[f]:
            out.append(("H7", f"{sid}: {f} unavailable {day} P{p}"))
        if (day, p) in ds.room_un[rid]:
            out.append(("H8", f"{sid}: {rid} unavailable {day} P{p}"))
    return out


def _is_placeable(ds: Dataset, sid: str, day: str, start, rid: str) -> bool:
    """True when the placement passes the early-exit checks, so it occupies cells."""
    errs = _placement_errors(ds, sid, day, start, rid)
    return not any(code in ("H1",) or msg.startswith(f"{sid}: start period") for code, msg in errs)


def _occupancy(ds: Dataset, assign: Assign):
    room_occ, fac_occ, grp_occ = defaultdict(list), defaultdict(list), defaultdict(set)
    fac_day, basket_time = defaultdict(int), defaultdict(set)
    for sid, (day, start, rid) in assign.items():
        if not _is_placeable(ds, sid, day, start, rid):
            continue
        s = ds.sessions[sid]
        key = s.get("basket_slot") or sid
        for p in block(start, s["duration"]):
            room_occ[(rid, day, p)].append(sid)
            fac_occ[(s["faculty_id"], day, p)].append(sid)
            for g in s["groups"]:
                grp_occ[(g, day, p)].add(key)
        fac_day[(s["faculty_id"], day)] += s["duration"]
        if s.get("basket_slot"):
            basket_time[s["basket_slot"]].add((day, start))
    return room_occ, fac_occ, grp_occ, fac_day, basket_time


def check_timetable(ds: Dataset, assign: Assign, where: str = "timetable") -> list[Violation]:
    out = [Violation("H1", where, f"Session {sid} is not scheduled") for sid in ds.sessions if sid not in assign]
    for sid, (day, start, rid) in assign.items():
        out += [Violation(c, where, m) for c, m in _placement_errors(ds, sid, day, start, rid)]
    room_occ, fac_occ, grp_occ, fac_day, basket_time = _occupancy(ds, assign)
    for (rid, day, p), sids in room_occ.items():
        if len(sids) > 1:
            out.append(Violation("H4", where, f"{rid} double-booked {day} P{p}: {', '.join(sorted(sids))}"))
    for (f, day, p), sids in fac_occ.items():
        if len(sids) > 1:
            out.append(Violation("H2", where, f"{f} double-booked {day} P{p}: {', '.join(sorted(sids))}"))
    for (g, day, p), keys in grp_occ.items():
        if len(keys) > 1:
            out.append(Violation("H3", where, f"Group {g} double-booked {day} P{p}: {', '.join(sorted(keys))}"))
    for b, times in basket_time.items():
        if len(times) > 1:
            out.append(Violation("H11", where, f"Basket {b} sessions are not at the same time: {sorted(times)}"))
    for (f, day), h in fac_day.items():
        mx = ds.faculty[f].get("max_hours_per_day", 4)
        if h > mx:
            out.append(Violation("H12", where, f"{f} teaches {h} hours on {day} (max {mx})"))
    return out


def group_busy(ds: Dataset, assign: Assign) -> dict[tuple[str, str, int], set[str]]:
    return _occupancy(ds, assign)[2]


def check_move(ds: Dataset, assign: Assign, session_id: str, day: str, start: int, room: str) -> list[Violation]:
    """Violations that moving one session to (day, start, room) would cause, ignoring problems
    already present elsewhere in the timetable."""
    trial = dict(assign)
    trial.pop(session_id, None)
    before = {(v.rule, v.detail) for v in check_timetable(ds, trial, "move")}
    trial[session_id] = (day, start, room)
    return [v for v in check_timetable(ds, trial, "move")
            if (v.rule, v.detail) not in before and not (v.rule == "H1" and "is not scheduled" in v.detail)]


# ---------------------------------------------------------------- soft
def soft_score(ds: Dataset, assign: Assign) -> tuple[dict[str, int], int]:
    pen = {k: 0 for k in SOFT_KEYS}
    grp_periods, grp_hours, grp_course = defaultdict(set), defaultdict(int), defaultdict(int)
    basket_course_day = defaultdict(int)
    seen_basket = set()
    for sid, (day, start, rid) in assign.items():
        s, r = ds.sessions.get(sid), ds.rooms.get(rid)
        if s is None or r is None:
            continue
        per = block(start, s["duration"])
        for pref in ds.faculty.get(s["faculty_id"], {}).get("preferences", []):
            if pref.get("type") == "avoid" and day in pref.get("days", ds.days):
                pen["S1"] += 2 * sum(1 for p in per if p in pref["periods"])
        if r["capacity"] and s["size"] / r["capacity"] < 0.4:
            pen["S5"] += 1
        if LAST_TEACHING in per:
            pen["S6"] += 1
        if s.get("basket_slot"):
            basket_course_day[(s["course_id"], day)] += 1
        for g in s["groups"]:
            grp_periods[(g, day)].update(per)
            if s.get("basket_slot"):
                if (g, s["basket_slot"]) in seen_basket:
                    continue
                seen_basket.add((g, s["basket_slot"]))
            grp_hours[(g, day)] += s["duration"]
            if s["kind"] == "lecture" and not s.get("basket_slot"):
                grp_course[(g, day, s["course_id"])] += 1
    for ps in grp_periods.values():
        pen["S2"] += sum(1 for p in range(min(ps), max(ps) + 1) if p not in ps)
    pen["S3"] += sum(3 * (h - 6) for h in grp_hours.values() if h > 6)
    pen["S4"] += sum(3 * (c - 1) for c in grp_course.values() if c > 1)
    pen["S4"] += sum(3 * (c - 1) for c in basket_course_day.values() if c > 1)
    return pen, sum(pen.values())


# ---------------------------------------------------------------- bookings
def week_view(ds: Dataset, assign: Assign, overrides: list[dict]) -> Assign:
    week = dict(assign)
    for o in overrides:
        if o.get("session_id") in ds.sessions:
            week[o["session_id"]] = (o["day"], o["start_period"], o["room_id"])
    return week


def _room_busy(ds: Dataset, view: Assign) -> dict[tuple[str, str, int], list[str]]:
    busy = defaultdict(list)
    for sid, (day, start, rid) in view.items():
        s = ds.sessions.get(sid)
        if s:
            for p in block(start, s["duration"]):
                busy[(rid, day, p)].append(sid)
    return busy


def _booking_errors(ds: Dataset, req: dict, d: dict, busy, grp, approved: bool) -> list[str]:
    room = ds.rooms.get(d.get("room_id"))
    day, a, b = d.get("day"), d.get("start_period"), d.get("end_period")
    if room is None:
        return [f"unknown room {d.get('room_id')}"]
    if day not in ds.days or not isinstance(a, int) or not isinstance(b, int) or a < 1 or b > MAX_PERIOD or b < a:
        return [f"invalid time {day} P{a}-P{b}"]
    out = []
    if b - a + 1 != req["duration_periods"]:
        out.append(f"booked {b - a + 1} periods, request needs {req['duration_periods']}")
    if "event" not in room["allowed_uses"]:
        out.append(f"{room['id']} cannot host events")
    if room["type"] not in req["room_types"]:
        out.append(f"{room['id']} ({room['type']}) is not one of {req['room_types']}")
    if room["capacity"] < req["attendance"]:
        out.append(f"{room['id']} seats {room['capacity']}, request needs {req['attendance']}")
    missing = set(req["needs"]) - _room_feats(room)
    if missing:
        out.append(f"{room['id']} lacks {sorted(missing)}")
    if approved and not any(w["day"] == day and w["from_period"] <= a and b <= w["to_period"] for w in req["windows"]):
        out.append(f"approved at {day} P{a}-P{b}, outside the requested windows (use alternative_offered)")
    for p in range(a, b + 1):
        if (day, p) in ds.room_un[room["id"]]:
            out.append(f"{room['id']} unavailable {day} P{p}")
        if busy[(room["id"], day, p)]:
            out.append(f"{room['id']} {day} P{p} already used by {', '.join(busy[(room['id'], day, p)])}")
        for g in req["mandatory_for_groups"]:
            if grp.get((g, day, p)):
                out.append(f"mandatory for {g}, who have class {day} P{p}")
    return out


def check_booking(ds: Dataset, view: Assign, draft: dict, taken: list[dict]) -> list[Violation]:
    """Check one booking placement (draft holds the request fields plus day/start_period/end_period/room_id)
    against a Week-7 view and other already-placed bookings ({room_id, day, start_period, end_period, request_id})."""
    busy = _room_busy(ds, view)
    for t in taken:
        for p in range(t["start_period"], t["end_period"] + 1):
            busy[(t["room_id"], t["day"], p)].append(t.get("request_id", "booking"))
    grp = group_busy(ds, view)
    rid = draft.get("id", "request")
    return [Violation("H13", "booking", f"{rid}: {m}")
            for m in _booking_errors(ds, draft, draft, busy, grp, approved=True)]


def free_rooms(ds: Dataset, view: Assign, taken: list[dict], day: str, from_p: int, to_p: int,
               attendance: int, needs: list[str], room_types: list[str] | None = None) -> list[str]:
    """Event-capable rooms free for the whole of day P{from_p}-P{to_p}, smallest first."""
    types = room_types or sorted({r["type"] for r in ds.rooms.values()})
    req = {"duration_periods": to_p - from_p + 1, "room_types": types, "attendance": attendance, "needs": needs,
           "mandatory_for_groups": [], "windows": [{"day": day, "from_period": from_p, "to_period": to_p}]}
    out = []
    for room in sorted(ds.rooms.values(), key=lambda r: (r["capacity"], r["id"])):
        d = {**req, "day": day, "start_period": from_p, "end_period": to_p, "room_id": room["id"]}
        if not check_booking(ds, view, d, taken):
            out.append(room["id"])
    return out


def check_fest(ds: Dataset, assign: Assign, decisions: list[dict], overrides: list[dict]) -> tuple[list[Violation], list[str], dict]:
    """Spectra-week checks. Returns (violations, warnings, stats)."""
    V, W = [], []
    dec_by = {}
    for d in decisions:
        if d.get("request_id") in dec_by:
            V.append(Violation("B1", "fest_week", f"Two decisions for {d['request_id']}"))
        dec_by[d.get("request_id")] = d

    week = dict(assign)
    inst = ds.priority_order.index("institute_event")
    for o in overrides:
        sid = o.get("session_id")
        if sid not in ds.sessions:
            V.append(Violation("B2", "fest_week", f"Override for unknown session {sid}"))
            continue
        disp, req = dec_by.get(o.get("displaced_by")), ds.requests.get(o.get("displaced_by"))
        if not req or not disp or disp.get("status") != "approved":
            V.append(Violation("B2", "fest_week", f"Override of {sid} names {o.get('displaced_by')}, which is not an approved booking"))
        elif ds.priority_order.index(effective_category(ds, req)) > inst:
            V.append(Violation("B2", "fest_week", f"{o['displaced_by']} ({effective_category(ds, req)}) is not allowed to displace a regular session"))
        week[sid] = (o["day"], o["start_period"], o["room_id"])
    V += check_timetable(ds, week, "fest_week")
    grp = group_busy(ds, week)
    busy = _room_busy(ds, week)

    score, max_score, placed = 0.0, 0, {}
    max_score = sum(CAT_WEIGHT[effective_category(ds, r)] for i, r in ds.requests.items() if i not in ds.cancelled)
    for req_id, req in ds.requests.items():
        d = dec_by.get(req_id)
        if d is None:
            W.append(f"No decision for {req_id}")
            continue
        st = d.get("status")
        if req_id in ds.cancelled:
            if st in ("approved", "alternative_offered"):
                V.append(Violation("B3", "fest_week", f"{req_id} was cancelled but is {st}"))
            continue
        if st not in ("approved", "rejected", "alternative_offered"):
            V.append(Violation("B1", "fest_week", f"{req_id}: unknown status {st}"))
            continue
        if st in ("rejected", "alternative_offered") and not str(d.get("reason", "")).strip():
            W.append(f"{req_id}: {st} without a reason")
        if st == "rejected":
            continue
        errs = _booking_errors(ds, req, d, busy, grp, approved=(st == "approved"))
        V += [Violation("H13", "fest_week", f"{req_id}: {m}") for m in errs]
        if not errs:
            for p in range(d["start_period"], d["end_period"] + 1):
                busy[(d["room_id"], d["day"], p)].append(req_id)
            placed[req_id] = (d["room_id"], d["day"], d["start_period"], d["end_period"])
            score += CAT_WEIGHT[effective_category(ds, req)] * (1 if st == "approved" else 0.5)

    inversions = []
    for req_id, req in ds.requests.items():
        d = dec_by.get(req_id)
        if req_id in ds.cancelled or not d or d.get("status") != "rejected":
            continue
        for other_id, (rid, day, a, b) in placed.items():
            if dec_by[other_id].get("status") != "approved" or not outranks(ds, req, ds.requests[other_id]):
                continue
            if _could_take(ds, req, rid, day, a, b, other_id, busy, grp):
                inversions.append(f"{req_id} rejected, but {other_id} (lower priority) holds {rid} {day} P{a}-P{b} that {req_id} could use")
                break

    stats = {"booking_score": score, "booking_score_max_if_all_approved": max_score,
             "approved": sum(1 for x in decisions if x.get("status") == "approved"),
             "alternatives": sum(1 for x in decisions if x.get("status") == "alternative_offered"),
             "rejected": sum(1 for x in decisions if x.get("status") == "rejected"),
             "session_overrides": len(overrides), "priority_inversions": inversions}
    return V, W, stats


def _could_take(ds, req, rid, day, a, b, other_id, busy, grp) -> bool:
    room = ds.rooms[rid]
    if room["type"] not in req["room_types"] or room["capacity"] < req["attendance"] or set(req["needs"]) - _room_feats(room):
        return False
    for w in req["windows"]:
        if w["day"] != day:
            continue
        for s0 in range(w["from_period"], w["to_period"] - req["duration_periods"] + 2):
            per = range(s0, s0 + req["duration_periods"])
            if per[-1] > MAX_PERIOD or not any(a <= p <= b for p in per):
                continue
            clash = any((day, p) in ds.room_un[rid] or [x for x in busy[(rid, day, p)] if x != other_id]
                        or any(grp.get((g, day, p)) for g in req["mandatory_for_groups"]) for p in per)
            if not clash:
                return True
        return False
    return False


# ---------------------------------------------------------------- exams
def check_exams(ds: Dataset, exams_out: list[dict]) -> tuple[list[Violation], int]:
    ex = {e["id"]: e for e in ds.exams}
    cal = ds.calendar["exam_week"]
    slot_ids = {s["id"] for s in cal["sessions"]}
    V, pen = [], 0
    room_use, grp_use, grp_day = defaultdict(list), defaultdict(list), defaultdict(set)
    seen = set()
    for e in exams_out:
        eid = e.get("exam_id")
        if eid not in ex:
            V.append(Violation("E1", "exams", f"Unknown exam {eid}"))
            continue
        if eid in seen:
            V.append(Violation("E1", "exams", f"{eid} scheduled twice"))
        seen.add(eid)
        if e.get("day") not in cal["days"] or e.get("session") not in slot_ids:
            V.append(Violation("E1", "exams", f"{eid}: invalid slot"))
            continue
        seats = 0
        for rid in e.get("rooms", []):
            r = ds.rooms.get(rid)
            if r is None or "exam" not in r["allowed_uses"]:
                V.append(Violation("E2", "exams", f"{eid}: {rid} cannot host exams"))
                continue
            seats += r["capacity"] // 2
            room_use[(rid, e["day"], e["session"])].append(eid)
        if seats < ex[eid]["size"]:
            V.append(Violation("H5", "exams", f"{eid}: {seats} seats at half capacity for {ex[eid]['size']} students"))
        for g in ex[eid]["groups"]:
            grp_use[(g, e["day"], e["session"])].append(eid)
            grp_day[(g, e["day"])].add(eid)
    V += [Violation("E1", "exams", f"{eid} not scheduled") for eid in ex if eid not in seen]
    V += [Violation("H4", "exams", f"{k[0]} has {v} in {k[1]} {k[2]}") for k, v in room_use.items() if len(v) > 1]
    V += [Violation("H3", "exams", f"Group {k[0]} has {v} in {k[1]} {k[2]}") for k, v in grp_use.items() if len(v) > 1]
    pen = sum(5 * (len(v) - 1) for v in grp_day.values() if len(v) > 1)
    return V, pen


# ---------------------------------------------------------------- full report
def schedule_assign(schedule: dict) -> tuple[Assign, list[str]]:
    out, dup = {}, []
    for e in schedule.get("sessions", []):
        sid = e.get("session_id")
        if sid in out:
            dup.append(sid)
        out[sid] = (e.get("day"), e.get("start_period"), e.get("room_id"))
    return out, dup


def full_report(ds: Dataset, schedule: dict, baseline: dict | None = None) -> dict:
    """Same shape as the official validator's report."""
    rep = {"dataset_id": ds.dataset_id, "schedule_dataset_id": schedule.get("dataset_id"), "team": schedule.get("team")}
    assign, dup = schedule_assign(schedule)
    V = check_timetable(ds, assign)
    V += [Violation("H1", "timetable", f"Session {d} appears more than once") for d in dup]
    rep["soft_penalties"], rep["soft_total"] = soft_score(ds, assign)
    W = []
    if "fest_week" in schedule:
        fest = schedule["fest_week"]
        bv, bw, stats = check_fest(ds, assign, fest.get("bookings", []), fest.get("session_overrides", []))
        V += bv
        W += bw
        rep["bookings"] = stats
    if ds.exams and (baseline is None or schedule.get("exams")):
        ev, epen = check_exams(ds, schedule.get("exams") or [])
        V += ev
        rep["exam_soft_penalty"] = epen
    if baseline is not None:
        b, _ = schedule_assign(baseline)
        moved = [s for s in assign if s in b and s in ds.sessions and tuple(assign[s]) != tuple(b[s])]
        rep["stability"] = {"sessions_moved": len(moved),
                            "time_changed": sum(1 for s in moved if assign[s][:2] != b[s][:2]),
                            "room_only_changed": sum(1 for s in moved if assign[s][:2] == b[s][:2]),
                            "moved_ids": sorted(moved)}
    seen, uniq = set(), []
    for v in V:
        if (v.rule, v.detail) not in seen:
            seen.add((v.rule, v.detail))
            uniq.append(asdict(v))
    rep["hard_violations"] = uniq
    rep["hard_violation_count"] = len(uniq)
    rep["hard_by_rule"] = {}
    for v in uniq:
        rep["hard_by_rule"][v["rule"]] = rep["hard_by_rule"].get(v["rule"], 0) + 1
    rep["warnings"] = W
    return rep
