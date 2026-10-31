import copy
import json
from collections import defaultdict
from pathlib import Path

from .model import Dataset, DatasetError

REQUIRED_KEYS = ("dataset_id", "calendar", "priority_order", "role_category_cap", "rooms",
                 "faculty", "student_groups", "sessions")


def load_dataset(src: str | Path | dict) -> Dataset:
    raw = src if isinstance(src, dict) else json.loads(Path(src).read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise DatasetError("Dataset must be a JSON object")
    missing = [k for k in REQUIRED_KEYS if k not in raw]
    if missing:
        raise DatasetError(f"Dataset is missing: {', '.join(missing)}")

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


def apply_changes(ds: Dataset, change_file: dict) -> Dataset:
    """Apply a change file (starter-pack format). Returns a new Dataset; ds is untouched."""
    if not isinstance(change_file, dict) or not isinstance(change_file.get("changes"), list):
        raise DatasetError("Change file must be an object with a 'changes' list")
    raw = copy.deepcopy(ds.raw)
    fac = {f["id"]: f for f in raw["faculty"]}
    rooms = {r["id"] for r in raw["rooms"]}
    raw.setdefault("room_unavailability", [])

    for i, ch in enumerate(change_file["changes"]):
        t = ch.get("type") if isinstance(ch, dict) else None
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
                raw["faculty"].append(f)
                fac[f["id"]] = f
            elif t == "add_session":
                s = ch["session"]
                if s["faculty_id"] not in fac:
                    raise DatasetError(f"Change {i + 1}: session {s['id']} names unknown faculty {s['faculty_id']}")
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
