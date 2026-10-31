import copy
import json
from collections import defaultdict
from pathlib import Path

from .model import Dataset, DatasetError

SESSION_FIELDS = ("id", "course_id", "kind", "groups", "faculty_id", "size", "duration", "room_types")
FACULTY_FIELDS = ("id", "name", "max_hours_per_day")
ROOM_FIELDS = ("id", "type", "capacity", "features", "accessible", "allowed_uses")
REQUEST_FIELDS = ("id", "submitted_at", "role", "requested_category", "attendance", "duration_periods",
                  "windows", "room_types", "needs", "mandatory_for_groups")
REQUIRED_KEYS = ("dataset_id", "calendar", "priority_order", "role_category_cap", "rooms",
                 "faculty", "student_groups", "sessions")


def _need(ok, msg):
    if not ok:
        raise DatasetError(msg)


def _items(raw, key, label, fields):
    items = raw.get(key, [])
    _need(isinstance(items, list), f"'{key}' must be a list")
    for i, it in enumerate(items):
        _need(isinstance(it, dict), f"{label} #{i + 1} must be an object")
        missing = [f for f in fields if f not in it]
        _need(not missing, f"{label} {it.get('id', '#' + str(i + 1))}: missing {', '.join(missing)}")
    return items


def _whole(v, minimum=0):
    return isinstance(v, int) and not isinstance(v, bool) and v >= minimum


def _check_cells(entries, label):
    for u in entries:
        _need(isinstance(u, dict) and "day" in u and "periods" in u, f"{label}: missing day/periods")
        _need(isinstance(u["periods"], list), f"{label}: periods must be a list")


def check_session(s: dict, faculty_ids, where: str):
    _require(s, SESSION_FIELDS, where)
    _need(_whole(s["duration"], 1), f"{where}: duration must be a positive whole number")
    _need(_whole(s["size"]), f"{where}: size must be a whole number")
    for key in ("groups", "room_types"):
        _need(isinstance(s[key], list), f"{where}: {key} must be a list")
    _need(s["faculty_id"] in faculty_ids, f"{where}: unknown faculty {s['faculty_id']}")
    fx = s.get("fixed_slot")
    _need(fx is None or (isinstance(fx, dict) and "day" in fx and "start_period" in fx),
          f"{where}: fixed_slot needs day and start_period")


def validate(raw) -> None:
    """Structural checks so a bad upload fails here with a readable message, not deep in the solver."""
    _need(isinstance(raw, dict), "Dataset must be a JSON object")
    missing = [k for k in REQUIRED_KEYS if k not in raw]
    _need(not missing, f"Dataset is missing: {', '.join(missing)}")
    cal = raw["calendar"]
    _need(isinstance(cal, dict), "calendar must be an object")
    for key in ("days", "lab_start_periods", "lunch"):
        _need(key in cal, f"calendar: missing {key}")
    _need(isinstance(cal["days"], list) and cal["days"], "calendar: days must be a non-empty list")
    if raw.get("exams"):
        _need("exam_week" in cal, "calendar: missing exam_week (needed for exams)")
    order = raw["priority_order"]
    _need(isinstance(order, list), "priority_order must be a list")
    for role, cap in dict(raw["role_category_cap"]).items():
        _need(cap in order, f"role_category_cap: {role} -> {cap} is not in priority_order")

    for r in _items(raw, "rooms", "Room", ROOM_FIELDS):
        _need(_whole(r["capacity"]), f"Room {r['id']}: capacity must be a whole number")
        for key in ("features", "allowed_uses"):
            _need(isinstance(r[key], list), f"Room {r['id']}: {key} must be a list")
    faculty = _items(raw, "faculty", "Faculty", ("id",))
    for f in faculty:
        _check_cells(f.get("unavailable", []), f"Faculty {f['id']} unavailable entry")
        _need("max_hours_per_day" not in f or _whole(f["max_hours_per_day"]),
              f"Faculty {f['id']}: max_hours_per_day must be a whole number")
    _items(raw, "student_groups", "Student group", ("id", "size"))
    ids = {f["id"] for f in faculty}
    for s in _items(raw, "sessions", "Session", ("id",)):
        check_session(s, ids, f"Session {s['id']}")
    _check_cells(_items(raw, "room_unavailability", "Room unavailability", ("room_id",)), "Room unavailability")
    for b in _items(raw, "booking_requests", "Booking request", REQUEST_FIELDS):
        for key in ("windows", "room_types", "needs", "mandatory_for_groups"):
            _need(isinstance(b[key], list), f"Booking request {b['id']}: {key} must be a list")
        for w in b["windows"]:
            _need(isinstance(w, dict) and {"day", "from_period", "to_period"} <= set(w),
                  f"Booking request {b['id']}: each window needs day, from_period, to_period")
    _items(raw, "cancellations", "Cancellation", ("request_id",))
    for e in _items(raw, "exams", "Exam", ("id", "groups", "size")):
        _need(_whole(e["size"]) and isinstance(e["groups"], list), f"Exam {e['id']}: size/groups are malformed")


def load_dataset(src: str | Path | dict) -> Dataset:
    if isinstance(src, (str, Path)):
        try:
            raw = json.loads(Path(src).read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise DatasetError(f"Dataset file is not valid JSON: {e}") from None
    else:
        raw = src
    validate(raw)

    fac_un = defaultdict(set)
    for f in raw["faculty"]:
        for u in f.get("unavailable", []):
            fac_un[f["id"]].update((u["day"], p) for p in u["periods"])
    room_un = defaultdict(set)
    for u in raw.get("room_unavailability", []):
        room_un[u["room_id"]].update((u["day"], p) for p in u["periods"])

    return Dataset(
        raw=raw,
        dataset_id=raw["dataset_id"],
        calendar=raw["calendar"],
        priority_order=list(raw["priority_order"]),
        role_cap=dict(raw["role_category_cap"]),
        rooms={r["id"]: r for r in raw["rooms"]},
        faculty={f["id"]: f for f in raw["faculty"]},
        groups={g["id"]: g for g in raw["student_groups"]},
        sessions={s["id"]: s for s in raw["sessions"]},
        requests={b["id"]: b for b in raw.get("booking_requests", [])},
        cancelled={c["request_id"] for c in raw.get("cancellations", [])},
        exams=list(raw.get("exams", [])),
        fac_un=fac_un,
        room_un=room_un,
    )


def _require(obj, fields, where):
    if not isinstance(obj, dict):
        raise DatasetError(f"{where}: expected an object")
    missing = [k for k in fields if k not in obj]
    if missing:
        raise DatasetError(f"{where}: missing {', '.join(missing)}")


def apply_changes(ds: Dataset, change_file: dict) -> Dataset:
    """Apply a change file (starter-pack format). Returns a new Dataset; ds is untouched."""
    if not isinstance(change_file, dict) or not isinstance(change_file.get("changes"), list):
        raise DatasetError("Change file must be an object with a 'changes' list")
    raw = copy.deepcopy(ds.raw)
    fac = {f["id"]: f for f in raw["faculty"]}
    rooms = {r["id"] for r in raw["rooms"]}
    raw.setdefault("room_unavailability", [])

    for i, ch in enumerate(copy.deepcopy(change_file["changes"])):
        t = ch.get("type") if isinstance(ch, dict) else None
        for key in ("days", "periods"):
            if isinstance(ch, dict) and key in ch and not isinstance(ch[key], list):
                raise DatasetError(f"Change {i + 1} ({t}): '{key}' must be a list")
        try:
            if t == "faculty_unavailable":
                if ch["faculty_id"] not in fac:
                    raise DatasetError(f"Change {i + 1}: unknown faculty {ch['faculty_id']}")
                for day in ch["days"]:
                    fac[ch["faculty_id"]].setdefault("unavailable", []).append(
                        {"day": day, "periods": list(ch["periods"]), "reason": ch.get("reason", "")})
            elif t == "room_unavailable":
                if ch["room_id"] not in rooms:
                    raise DatasetError(f"Change {i + 1}: unknown room {ch['room_id']}")
                for day in ch["days"]:
                    raw["room_unavailability"].append(
                        {"room_id": ch["room_id"], "day": day, "periods": list(ch["periods"]),
                         "reason": ch.get("reason", "")})
            elif t == "add_faculty":
                f = ch["faculty"]
                _require(f, FACULTY_FIELDS, f"Change {i + 1} (add_faculty)")
                f.setdefault("unavailable", [])
                f.setdefault("preferences", [])
                raw["faculty"].append(f)
                fac[f["id"]] = f
            elif t == "add_session":
                s = ch["session"]
                check_session(s, fac, f"Change {i + 1} (add_session {s.get('id', '?') if isinstance(s, dict) else '?'})")
                raw["sessions"].append(s)
            elif t == "remove_session":
                before = len(raw["sessions"])
                raw["sessions"] = [s for s in raw["sessions"] if s["id"] != ch["session_id"]]
                if len(raw["sessions"]) == before:
                    raise DatasetError(f"Change {i + 1}: unknown session {ch['session_id']}")
            else:
                raise DatasetError(f"Change {i + 1}: unknown change type {t!r}")
        except KeyError as e:
            raise DatasetError(f"Change {i + 1} ({t}): missing field {e.args[0]}") from None
    return load_dataset(raw)
