"""Plain-language venue request -> editable booking draft.

The LLM (or, when it is unavailable, simple keyword rules) only extracts fields. Everything after that
is code: days and periods are worked out from the calendar, the category is capped by the user's role,
a named room that can't meet the needs is dropped, and anything essential that is missing becomes a
follow-up question. The draft has no status: only /bookings decides anything."""
import re

from ..auth import DATASET_ROLE
from ..core.checker import _room_feats
from ..core.model import MAX_PERIOD, Dataset
from ..core.priority import effective_category
from ..solver.fest import CAT_LABEL
from . import client
from .timeparse import HINTS, end_period, resolve_relative, start_period, today_code

DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
CATEGORIES = ["institute_event", "guest_lecture", "department_event", "club_event"]
FEATURES = ["projector", "pa_system", "stage", "ac", "computers", "power_benches", "accessible"]

_WINDOW = {"type": "OBJECT", "properties": {
    "day": {"type": "STRING", "enum": DAY_CODES, "nullable": True},
    "relative_day": {"type": "STRING", "enum": ["today", "tomorrow", "day_after"], "nullable": True},
    "start_time": {"type": "STRING", "nullable": True, "description": "24-hour HH:MM"},
    "end_time": {"type": "STRING", "nullable": True, "description": "24-hour HH:MM"},
    "time_hint": {"type": "STRING", "enum": list(HINTS), "nullable": True}}}
SCHEMA = {"type": "OBJECT", "properties": {
    "title": {"type": "STRING"},
    "attendance": {"type": "INTEGER", "nullable": True},
    "duration_hours": {"type": "NUMBER", "nullable": True},
    "windows": {"type": "ARRAY", "items": _WINDOW, "description": "alternative times; any one is fine"},
    "repeat_days": {"type": "ARRAY", "items": {"type": "STRING", "enum": DAY_CODES}},
    "room_types": {"type": "ARRAY", "items": {"type": "STRING"}},
    "needs": {"type": "ARRAY", "items": {"type": "STRING", "enum": FEATURES}},
    "requested_room": {"type": "STRING", "nullable": True},
    "mandatory_for_groups": {"type": "ARRAY", "items": {"type": "STRING"}},
    "requested_category": {"type": "STRING", "enum": CATEGORIES},
    "conditions": {"type": "ARRAY", "items": {"type": "STRING"}},
    "notes": {"type": "ARRAY", "items": {"type": "STRING"}}},
    "required": ["title", "windows", "needs", "room_types", "requested_category"]}


def reference(ds: Dataset) -> str:
    rooms = "\n".join(f"- {r['id']}: {r.get('name', r['id'])} ({r['type']}, seats {r['capacity']})"
                      for r in ds.rooms.values() if "event" in r["allowed_uses"])
    groups = "\n".join(f"- {g['id']}: {g.get('name', g['id'])}" for g in ds.groups.values())
    types = ", ".join(sorted({r["type"] for r in ds.rooms.values() if "event" in r["allowed_uses"]}))
    return f"Bookable rooms:\n{rooms}\n\nRoom types: {types}\n\nStudent groups:\n{groups}"


# ---------------------------------------------------------------- keyword rules (LLM down)
_DAY_WORDS = {"MON": ["monday", "mon", "somvar", "somvaar"], "TUE": ["tuesday", "tue", "tues", "mangalvar", "mangalvaar"],
              "WED": ["wednesday", "wed", "budhvar", "budhvaar"], "THU": ["thursday", "thu", "thurs", "guruvar", "guruvaar"],
              "FRI": ["friday", "fri", "shukravar", "shukravaar"], "SAT": ["saturday", "sat", "shanivar"],
              "SUN": ["sunday", "sun", "ravivar", "itvaar"]}
_NUM_WORDS = {"one": 1, "an": 1, "a": 1, "ek": 1, "two": 2, "do": 2, "three": 3, "teen": 3, "four": 4, "char": 4,
              "five": 5, "six": 6}
_NEED_WORDS = {"pa_system": r"\b(mic|mike|mics|sound|pa|audio|loudspeakers?)\b", "projector": r"\b(projector|ppt|screen|slides)\b",
               "stage": r"\bstage\b", "ac": r"\b(ac|air[- ]?condition\w*)\b", "computers": r"\b(computers?|pcs?|systems)\b",
               "power_benches": r"\b(power points?|power benches|charging|sockets?)\b",
               "accessible": r"\b(wheelchair|accessible|ramp|disabled)\b"}
_TYPE_WORDS = {"seminar_hall": r"\bseminar\b", "auditorium": r"\b(auditorium|aud)\b", "outdoor": r"\b(open[- ]air|oat|outdoor|ground)\b",
               "lecture_hall": r"\blecture hall\b", "lab_cs": r"\b(computer lab|cs lab|lab with computers)\b",
               "lab_elec": r"\b(elec(tronics)? lab)\b", "classroom": r"\b(classroom|small room|class room)\b"}
_DEPTS = {"CSE": r"\b(cse|computer science|cs)\b", "ECE": r"\b(ece|electronics)\b", "EE": r"\b(ee|electrical)\b",
          "ME": r"\b(me|mech|mechanical)\b", "CE": r"\b(ce|civil)\b"}
_YEARS = {1: r"\b(first|1st|fy|year 1)\b", 2: r"\b(second|2nd|year 2)\b", 3: r"\b(third|3rd|year 3)\b"}
_CLOCK = r"(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|baje|bje)?"


def _hour(h: int, m: int, mer: str | None, evening: bool) -> str:
    if mer == "pm" and h < 12:
        h += 12
    elif mer == "am" and h == 12:
        h = 0
    elif mer not in ("am", "pm") and h < 8:      # no college hour before 08:00: "6 baje" is 18:00
        h += 12
    elif mer not in ("am", "pm") and evening and h < 12:
        h += 12
    return f"{h:02d}:{m:02d}"


def rules(ds: Dataset, text: str) -> dict:
    t = " " + text.lower() + " "
    evening = bool(re.search(r"\b(evening|shaam|night|raat|pm)\b", t))
    out = {"title": "", "attendance": None, "duration_hours": None, "windows": [], "repeat_days": [], "room_types": [],
           "needs": [], "requested_room": None, "mandatory_for_groups": [], "requested_category": "club_event",
           "conditions": [], "notes": ["Filled in by simple keyword rules (the AI assistant is unavailable)"]}
    m = re.search(r"(\d{1,5})\s*\+?\s*(people|persons|log|logon|students|participants|attendees|members|guests|"
                  r"audience|visitors|spectators|dancers)", t) or re.search(r"\b(?:around|about|approx\.?|maybe|for)\s+(\d{1,5})\b", t)
    if m:
        out["attendance"] = int(m.group(1))
    num = r"(\d+(?:\.\d)?|" + "|".join(_NUM_WORDS) + r")"
    m = re.search(rf"\b{num}\s*(?:-|\s)?\s*(?:straight\s+|full\s+|whole\s+)?(hours?|hrs?|ghante|ghanta|ghanton)\b", t)
    if m:
        out["duration_hours"] = float(_NUM_WORDS.get(m.group(1), m.group(1)))
    rng = re.search(r"between\s+" + _CLOCK + r"\s*(?:and|to|-|–)\s*" + _CLOCK, t) or \
        re.search(_CLOCK + r"\s*(?:to|-|–|se|till|until)\s*" + _CLOCK, t)
    start = end = None
    if rng:
        mer2 = rng.group(6)
        start = _hour(int(rng.group(1)), int(rng.group(2) or 0), rng.group(3) or (mer2 if mer2 in ("am", "pm") else None), evening)
        end = _hour(int(rng.group(4)), int(rng.group(5) or 0), mer2, evening)
    else:
        one = re.search(r"\b(?:at|from|@)?\s*" + r"(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|baje|bje)\b", t)
        if one:
            start = _hour(int(one.group(1)), int(one.group(2) or 0), one.group(3), evening)
    hint = None
    for key, pat in (("after_lunch", r"after lunch|lunch ke baad"), ("afternoon", r"\b(afternoon|dopahar)\b"),
                     ("evening", r"\b(evening|shaam)\b"), ("morning", r"\b(morning|subah)\b"), ("night", r"\b(night|raat)\b")):
        if re.search(pat, t):
            hint = key
            break
    days = [code for code, words in _DAY_WORDS.items() if any(re.search(rf"\b{w}\b", t) for w in words)]
    rel = "tomorrow" if re.search(r"\b(kal|tomorrow|tmrw)\b", t) else "day_after" if re.search(r"\b(parso|day after)\b", t) \
        else "today" if re.search(r"\b(aaj|today|tonight)\b", t) else None
    every = bool(re.search(r"\b(every|each|daily|har|both days|all of)\b", t))
    if not days and re.search(r"\b(daily|every day|all (of )?(fest|spectra) week|roz)\b", t):
        days = list(ds.days)
    base = {"start_time": start, "end_time": end, "time_hint": None if start else hint}
    if days and every:
        out["windows"] = [{**base, "day": days[0], "relative_day": None}]
        out["repeat_days"] = days
    elif days:
        out["windows"] = [{**base, "day": d, "relative_day": None} for d in days]
    elif rel or start or hint:
        out["windows"] = [{**base, "day": None, "relative_day": rel}]
    out["needs"] = [n for n, pat in _NEED_WORDS.items() if re.search(pat, t)]
    out["room_types"] = [k for k, pat in _TYPE_WORDS.items() if re.search(pat, t)]
    if "computers" in out["needs"] and re.search(r"\blab\b", t) and "lab_cs" not in out["room_types"]:
        out["room_types"].append("lab_cs")
    for r in ds.rooms.values():
        if re.search(rf"\b{re.escape(r['id'].lower())}\b", t) or (r.get("name") and r["name"].lower() in t):
            out["requested_room"] = r["id"]
            break
    else:
        m = re.search(r"\b([a-z]{2,4}-\d{1,3})\b", t)
        if m:
            out["requested_room"] = m.group(1).upper()
    if re.search(r"\b(compulsory|mandatory|must attend|zaroori|required for)\b", t):
        for g in ds.groups.values():
            if re.search(rf"\b{re.escape(g['id'].lower())}\b", t):
                out["mandatory_for_groups"].append(g["id"])
        if not out["mandatory_for_groups"]:
            dept = next((d for d, pat in _DEPTS.items() if re.search(pat, t)), None)
            year = next((y for y, pat in _YEARS.items() if re.search(pat, t)), None)
            out["mandatory_for_groups"] = [g["id"] for g in ds.groups.values()
                                           if dept and year and g.get("department") == dept and g.get("year") == year]
    if re.search(r"institute (level|event)|official spectra", t):
        out["requested_category"] = "institute_event"
    elif re.search(r"guest lecture|guest speaker", t):
        out["requested_category"] = "guest_lecture"
    elif re.search(r"department event|dept event", t):
        out["requested_category"] = "department_event"
    words = re.sub(r"\s+", " ", text.strip())
    out["title"] = words[:60] + ("…" if len(words) > 60 else "")
    return out


# ---------------------------------------------------------------- code after extraction
def _event_types(ds: Dataset) -> set[str]:
    return {r["type"] for r in ds.rooms.values() if "event" in r["allowed_uses"]}


def _misfit(ds: Dataset, room: dict, attendance, needs, types) -> str | None:
    if "event" not in room["allowed_uses"]:
        return f"{room['id']} can't host events"
    if types and room["type"] not in types:
        return None      # the person named the room, so its type is what they want
    if attendance and room["capacity"] < attendance:
        return f"{room['id']} seats only {room['capacity']}"
    missing = set(needs) - _room_feats(room)
    if missing:
        return f"{room['id']} has no {', '.join(sorted(m.replace('_', ' ') for m in missing))}" \
            if missing != {"accessible"} else f"{room['id']} is not wheelchair accessible"
    return None


def finish(ds: Dataset, raw: dict, text: str, role: str, today: str) -> dict:
    guessed, notes, questions = [], list(raw.get("notes") or []), []
    days_ok = set(ds.days)

    # needs: what the extractor found plus keyword hits (so "mic" is never lost)
    needs = [n for n in (raw.get("needs") or []) if n in FEATURES]
    for n, pat in _NEED_WORDS.items():
        if n not in needs and re.search(pat, " " + text.lower() + " "):
            needs.append(n)
    attendance = raw.get("attendance")
    attendance = int(attendance) if isinstance(attendance, (int, float)) and attendance > 0 else None
    dur_h = raw.get("duration_hours")
    duration = max(1, round(dur_h)) if isinstance(dur_h, (int, float)) and dur_h > 0 else None

    windows = []
    for w in raw.get("windows") or []:
        day = w.get("day") if w.get("day") in days_ok else None
        if w.get("day") and not day:
            questions.append(f"Spectra week runs {ds.days[0]}–{ds.days[-1]}; {w['day']} is not part of it. Which day?")
            continue
        if not day and w.get("relative_day"):
            day = resolve_relative(ds, w["relative_day"], today)
            if day:
                guessed.append("windows")
                notes.append(f"\"{w['relative_day'].replace('_', ' ')}\" read as {day} (today taken as {today})")
            else:
                questions.append(f"That falls after {ds.days[-1]}, outside Spectra week. Which day?")
                continue
        if not day:
            continue
        a = start_period(ds, w["start_time"]) if w.get("start_time") else None
        b = end_period(ds, w["end_time"]) if w.get("end_time") else None
        if a and b and b >= a:
            duration = duration or (b - a + 1)
        elif a:
            if not duration:
                duration = 2
                guessed.append("duration_periods")
                notes.append("No length given; assumed 2 hours")
            b = a + duration - 1
        elif w.get("time_hint") in HINTS:
            a, b = HINTS[w["time_hint"]]
            guessed.append("windows")
            notes.append(f"\"{w['time_hint'].replace('_', ' ')}\" read as P{a}–P{b}")
        else:
            questions.append(f"What time on {day}, and for how long?")
            continue
        a, b = max(1, a), min(MAX_PERIOD, b)
        windows.append({"day": day, "from_period": a, "to_period": max(a, b)})
    if not windows and not questions:
        questions.append("Which day of Spectra week, and what time?")
    if windows and not duration:
        duration = min(2, min(w["to_period"] - w["from_period"] + 1 for w in windows))
        guessed.append("duration_periods")
        notes.append(f"No length given; assumed {duration} hour(s)")
    for w in windows:          # a window must at least hold the event
        if duration and w["to_period"] - w["from_period"] + 1 < duration:
            w["to_period"] = min(MAX_PERIOD, w["from_period"] + duration - 1)
    if duration and duration > MAX_PERIOD:
        duration = MAX_PERIOD
    groups = [g for g in (raw.get("mandatory_for_groups") or []) if g in ds.groups]
    if attendance is None and groups:      # compulsory for whole groups: they are the audience
        attendance = sum(ds.groups[g]["size"] for g in groups)
        guessed.append("attendance")
        notes.append(f"No head count given; used the size of {', '.join(groups)} ({attendance})")
    if attendance is None:
        questions.insert(0, "About how many people will attend?")

    types_ok = _event_types(ds)
    types = [t for t in (raw.get("room_types") or []) if t in types_ok]
    room = raw.get("requested_room")
    if room and room not in ds.rooms:
        by_name = next((r["id"] for r in ds.rooms.values() if r.get("name", "").lower() == str(room).lower()), None)
        if by_name:
            room = by_name
        else:
            notes.append(f"There is no room called {room}; any suitable room will be offered")
            guessed.append("requested_room")
            room = None
    if room:
        r = ds.rooms[room]
        why = _misfit(ds, r, attendance, needs, types)
        if why:
            same = [x["id"] for x in ds.rooms.values() if x["type"] == r["type"] and x["id"] != room
                    and not _misfit(ds, x, attendance, needs, [])]
            notes.append(f"{why}, so it was left out" + (f"; {', '.join(same)} fits instead" if same else ""))
            guessed.append("requested_room")
            if r["type"] not in types:
                types.append(r["type"])
            room = None
        elif r["type"] not in types:
            types.append(r["type"])
    if not types:
        fit = [x for x in ds.rooms.values() if "event" in x["allowed_uses"] and not set(needs) - _room_feats(x)
               and (attendance is None or x["capacity"] >= attendance)]
        labs = ("lab_cs", "lab_elec", "lab_phy", "lab_civil", "workshop")
        types = sorted({x["type"] for x in fit if x["type"] not in labs or "computers" in needs})
        if types:
            guessed.append("room_types")
            notes.append("No room type named; showing every type that fits")

    asked = raw.get("requested_category") if raw.get("requested_category") in CATEGORIES else "club_event"
    cat = effective_category(ds, {"role": DATASET_ROLE[role], "requested_category": asked})
    if cat != asked:
        notes.append(f"Asked for {CAT_LABEL[asked]}; a {DATASET_ROLE[role].replace('_', ' ')} account can book at most "
                     f"a {CAT_LABEL[cat]}, so that is what it is")
        guessed.append("requested_category")
    repeat = [d for d in (raw.get("repeat_days") or []) if d in days_ok]
    for c in raw.get("conditions") or []:
        notes.append(f"Condition noted: {c}")

    draft = {"title": (raw.get("title") or "").strip()[:200] or "Venue request", "attendance": attendance,
             "duration_periods": duration, "windows": windows, "room_types": types, "needs": needs,
             "requested_room": room, "mandatory_for_groups": groups, "requested_category": cat,
             "repeat_days": repeat if len(repeat) > 1 else [], "raw_text": text}
    return {"draft": draft, "guessed_fields": sorted(set(guessed)), "notes": notes,
            "follow_up": " ".join(dict.fromkeys(questions)) or None}


def parse_booking(ds: Dataset, text: str, role: str, today: str | None = None) -> dict:
    day = today_code(ds, today)
    system = client.prompt("booking").replace("{reference}", reference(ds))
    try:
        raw = client.ask(system, f"Today is {day}.\nRequest: {text}", SCHEMA)
        llm = "ok"
    except client.LLMUnavailable:
        raw, llm = rules(ds, text), "unavailable"
    out = finish(ds, raw, text, role, day)
    return {**out, "llm": llm, "today": day}
