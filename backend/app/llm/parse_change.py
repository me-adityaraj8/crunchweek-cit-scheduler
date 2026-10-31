"""Faculty/coordinator chat request -> ChangeIntent. The LLM (or keyword rules) extracts fields; code
finds the session, turns times into periods and, for a move with no valid target, picks the best valid
slot. The intent then goes through the same proposal and approval path as everything else."""
import re

from ..core.model import Assign, Dataset
from . import client
from .parse_booking import DAY_CODES, _CLOCK, _DAY_WORDS, _hour
from .timeparse import end_period, resolve_relative, start_period, today_code

SCHEMA = {"type": "OBJECT", "properties": {
    "type": {"type": "STRING", "enum": ["faculty_unavailable", "move_session", "remove_session", "unclear"]},
    "faculty_id": {"type": "STRING", "nullable": True},
    "course_id": {"type": "STRING", "nullable": True},
    "kind": {"type": "STRING", "enum": ["lecture", "tutorial", "lab"], "nullable": True},
    "days": {"type": "ARRAY", "items": {"type": "STRING", "enum": DAY_CODES}},
    "relative_day": {"type": "STRING", "enum": ["today", "tomorrow", "day_after"], "nullable": True},
    "start_time": {"type": "STRING", "nullable": True},
    "end_time": {"type": "STRING", "nullable": True},
    "whole_day": {"type": "BOOLEAN"},
    "current_day": {"type": "STRING", "enum": DAY_CODES, "nullable": True},
    "current_time": {"type": "STRING", "nullable": True},
    "target_day": {"type": "STRING", "enum": DAY_CODES, "nullable": True},
    "target_time": {"type": "STRING", "nullable": True},
    "target_room": {"type": "STRING", "nullable": True},
    "reason": {"type": "STRING"},
    "question": {"type": "STRING", "nullable": True},
    "notes": {"type": "ARRAY", "items": {"type": "STRING"}}},
    "required": ["type", "days", "whole_day", "reason"]}


def reference(ds: Dataset, faculty_id: str | None, assign: Assign | None) -> str:
    lines = []
    if faculty_id and faculty_id in ds.faculty:
        f = ds.faculty[faculty_id]
        lines.append(f"The person is {f['name']} ({faculty_id}). Their sessions:")
        for sid, s in ds.sessions.items():
            if s["faculty_id"] == faculty_id:
                at = assign.get(sid) if assign else None
                lines.append(f"- {sid}: {s['course_id']} {s['kind']} for {', '.join(s['groups'])}"
                             + (f", now {at[0]} P{at[1]} in {at[2]}" if at else ""))
    courses = sorted({s["course_id"] for s in ds.sessions.values()})
    lines.append("Course ids: " + ", ".join(courses))
    lines.append("Rooms: " + ", ".join(ds.rooms))
    return "\n".join(lines)


def rules(ds: Dataset, text: str) -> dict:
    t = " " + text.lower() + " "
    days = [c for c, words in _DAY_WORDS.items() if any(re.search(rf"\b{w}\b", t) for w in words)]
    rel = "tomorrow" if re.search(r"\b(kal|tomorrow)\b", t) else "today" if re.search(r"\b(aaj|today)\b", t) else None
    course = next((c for c in {s["course_id"] for s in ds.sessions.values()} if re.search(rf"\b{c.lower()}\b", t)), None)
    kind = next((k for k in ("lecture", "tutorial", "lab") if k in t), None)
    rng = re.search(_CLOCK + r"\s*(?:to|-|–|se|till|until)\s*" + _CLOCK, t)
    one = None if rng else re.search(r"(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|baje)\b", t)
    start = end = None
    if rng:
        start = _hour(int(rng.group(1)), int(rng.group(2) or 0), rng.group(3) or rng.group(6), False)
        end = _hour(int(rng.group(4)), int(rng.group(5) or 0), rng.group(6), False)
    elif one and one.group(3):
        start = _hour(int(one.group(1)), int(one.group(2) or 0), one.group(3), False)
    move = bool(re.search(r"\b(move|shift|reschedule|change .* to|instead)\b", t))
    leave = bool(re.search(r"\b(can'?t|cannot|unavailable|leave|off|busy|not available|chhutti|meeting)\b", t))
    typ = "faculty_unavailable" if leave and not (move and not days) else "move_session" if move else "unclear"
    return {"type": typ, "faculty_id": None, "course_id": course, "kind": kind, "days": days, "relative_day": rel,
            "start_time": start, "end_time": end, "whole_day": bool(re.search(r"\b(whole|all|full) day\b", t)),
            "current_day": None, "current_time": None, "target_day": None, "target_time": None, "target_room": None,
            "reason": "", "question": None if typ != "unclear" else "Do you want to mark times you can't teach, or move a class?",
            "notes": ["Filled in by simple keyword rules (the AI assistant is unavailable)"]}


def _find_session(ds: Dataset, assign: Assign, faculty_id: str | None, raw: dict) -> tuple[str | None, list[str]]:
    pool = [sid for sid, s in ds.sessions.items() if not faculty_id or s["faculty_id"] == faculty_id]
    if raw.get("course_id"):
        pool = [sid for sid in pool if ds.sessions[sid]["course_id"].lower() == str(raw["course_id"]).lower()]
    if raw.get("kind"):
        pool = [sid for sid in pool if ds.sessions[sid]["kind"] == raw["kind"]] or pool
    if raw.get("current_day"):
        pool = [sid for sid in pool if assign.get(sid, ("",))[0] == raw["current_day"]] or pool
    if raw.get("current_time"):
        p = start_period(ds, raw["current_time"])
        pool = [sid for sid in pool if assign.get(sid, ("", 0))[1] == p] or pool
    return (pool[0] if len(pool) == 1 else None), pool


def parse_change(ds: Dataset, assign: Assign | None, text: str, user_faculty: str | None,
                 today: str | None = None) -> dict:
    day = today_code(ds, today)
    system = client.prompt("change").replace("{reference}", reference(ds, user_faculty, assign))
    try:
        raw = client.ask(system, f"Today is {day}.\nRequest: {text}", SCHEMA)
        llm = "ok"
    except client.LLMUnavailable:
        raw, llm = rules(ds, text), "unavailable"
    notes = list(raw.get("notes") or [])
    fid = raw.get("faculty_id") if raw.get("faculty_id") in ds.faculty else user_faculty
    days = [d for d in raw.get("days") or [] if d in ds.days]
    if not days and raw.get("relative_day"):
        rd = resolve_relative(ds, raw["relative_day"], day)
        if rd:
            days = [rd]
            notes.append(f"\"{raw['relative_day'].replace('_', ' ')}\" read as {rd}")
    typ = raw.get("type")
    if typ == "faculty_unavailable":
        if raw.get("whole_day") or not raw.get("start_time"):
            periods = list(range(1, 10))
            if not raw.get("whole_day"):
                notes.append("No time given; marked the whole day")
        else:
            a = start_period(ds, raw["start_time"]) or 1
            b = end_period(ds, raw["end_time"]) if raw.get("end_time") else a
            periods = list(range(a, min(9, max(a, b or a)) + 1))
        if not days:
            return {"intent": None, "notes": notes, "follow_up": "Which day(s) can't you teach?", "llm": llm}
        if not fid:
            return {"intent": None, "notes": notes, "follow_up": "Which faculty member is this for?", "llm": llm}
        return {"intent": {"type": typ, "faculty_id": fid, "days": days, "periods": periods,
                           "reason": raw.get("reason") or text[:120]}, "notes": notes, "follow_up": None, "llm": llm}
    if typ in ("move_session", "remove_session"):
        sid, pool = _find_session(ds, assign or {}, user_faculty, raw)
        if sid is None:
            options = ", ".join(pool[:8]) if pool else "none of your sessions match"
            return {"intent": None, "notes": notes, "follow_up": f"Which session do you mean? ({options})", "llm": llm}
        if typ == "remove_session":
            return {"intent": {"type": typ, "session_id": sid, "reason": raw.get("reason") or ""},
                    "notes": notes, "follow_up": None, "llm": llm}
        target = None
        tday = raw.get("target_day") if raw.get("target_day") in ds.days else None
        tp = start_period(ds, raw["target_time"]) if raw.get("target_time") else None
        if tday and tp:
            room = raw.get("target_room") if raw.get("target_room") in ds.rooms else (assign or {}).get(sid, (None, None, None))[2]
            target = {"day": tday, "start": tp, "room": room}
        else:
            notes.append("No exact new time given; the best valid slot will be proposed")
        return {"intent": {"type": typ, "session_id": sid, "target": target, "reason": raw.get("reason") or "",
                           "_target_day": tday}, "notes": notes, "follow_up": None, "llm": llm}
    return {"intent": None, "notes": notes, "follow_up": raw.get("question") or
            "Do you want to mark times you can't teach, or move one of your classes? Say which and when.", "llm": llm}
