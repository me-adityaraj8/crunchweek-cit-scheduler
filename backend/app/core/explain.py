"""Why a session sits where it does, and why a booking got its decision. Every fact here comes from
the checker, never from an LLM (which may only reword these facts)."""
from collections import defaultdict

from .checker import check_move, soft_score
from .model import Assign, Dataset, block

RULE_LABEL = {
    "H2": "faculty busy", "H3": "group busy", "H4": "room taken", "H5": "room too small",
    "H6": "wrong room type", "H7": "faculty unavailable", "H8": "room closed", "H9": "time not allowed",
    "H10": "not accessible", "H11": "elective basket must stay together", "H12": "faculty daily limit",
    "H14": "fixed slot",
}


def _time(ds: Dataset, start: int, dur: int) -> str:
    periods = {p["id"]: p for p in ds.calendar.get("periods", [])}
    end = start + dur - 1
    if start in periods and end in periods:
        return f"{periods[start]['start']}–{periods[end]['end']}"
    return f"P{start}–P{end}"


def explain_session(ds: Dataset, assign: Assign, session_id: str) -> dict:
    from ..solver.model_builder import candidates   # solver depends on core, not the other way round

    s = ds.sessions[session_id]
    day, start, room = assign[session_id]
    f = ds.faculty.get(s["faculty_id"], {})
    base_soft = soft_score(ds, assign)[1]
    r = ds.rooms[room]

    facts = [f"{s['course_id']} {s['kind']} for {', '.join(s['groups'])} ({s['size']} students), "
             f"taught by {f.get('name', s['faculty_id'])}",
             f"{room} seats {r['capacity']} and is a {r['type'].replace('_', ' ')}"]
    if s.get("fixed_slot"):
        facts.append(f"This session has a fixed slot: {s['fixed_slot']['day']} P{s['fixed_slot']['start_period']}")
    if s.get("basket_slot"):
        facts.append(f"It is part of elective basket {s['basket_slot']}, so it runs alongside the other electives")
    if s["kind"] == "lab":
        facts.append("Three-hour labs may only start at P2 or P6")
    if ds.fac_un[s["faculty_id"]]:
        facts.append(f"{s['faculty_id']} is unavailable at {len(ds.fac_un[s['faculty_id']])} period(s) this week")
    for pref in f.get("preferences", []):
        if pref.get("type") == "avoid":
            hit = day in pref.get("days", ds.days) and set(block(start, s["duration"])) & set(pref["periods"])
            facts.append(f"{s['faculty_id']} asked to avoid {', '.join(pref.get('days', ['every day']))} "
                         f"P{', P'.join(map(str, pref['periods']))}" + (" — not possible here" if hit else " — respected"))

    # one row per other (day, start): the best room there, or what blocks it
    slots = defaultdict(list)
    for c in candidates(ds, s, relax=True):
        if (c[0], c[1]) != (day, start):
            slots[(c[0], c[1])].append(c[2])
    alternatives = []
    for (d, p), rooms in sorted(slots.items(), key=lambda k: (ds.days.index(k[0][0]), k[0][1])):
        best, reasons, room_clash_only = None, set(), True
        for rm in rooms:
            v = check_move(ds, assign, session_id, d, p, rm)
            if not v:
                delta = soft_score(ds, {**assign, session_id: (d, p, rm)})[1] - base_soft
                if best is None or delta < best[1]:
                    best = (rm, delta)
                continue
            if any(x.rule != "H4" for x in v):
                room_clash_only = False
            reasons.update(f"{RULE_LABEL.get(x.rule, x.rule)}: {x.detail}" for x in v if x.rule != "H4")
        if not best and room_clash_only:
            reasons.add(f"every suitable room is taken ({', '.join(rooms[:4])}{'…' if len(rooms) > 4 else ''})")
        if best:
            alternatives.append({"day": d, "start": p, "room": best[0], "blocked_by": [], "soft_delta": best[1]})
        else:
            alternatives.append({"day": d, "start": p, "room": None, "blocked_by": sorted(reasons), "soft_delta": None})

    open_slots = [a for a in alternatives if not a["blocked_by"]]
    facts.append(f"Of {len(alternatives) + 1} possible time slots, {len(alternatives) - len(open_slots)} break a hard rule"
                 + (f"; the other {len(open_slots)} would add soft penalty (gaps, long days, late classes...)"
                    if open_slots else ""))
    return {"session_id": session_id,
            "placed_at": {"day": day, "start": start, "room": room, "time": _time(ds, start, s["duration"])},
            "facts": facts, "alternatives": alternatives}


def explain_booking(ds: Dataset, fest, request_id: str) -> dict:
    d = next(x for x in fest.decisions if x.request_id == request_id)
    out = {"request_id": request_id, "status": d.status, "reason": d.reason, "facts": list(d.facts),
           "lost_to": d.lost_to, "displaces": list(d.displaces)}
    if d.room_id:
        out["placed_at"] = {"day": d.day, "start": d.start_period, "end": d.end_period, "room": d.room_id}
    return out
