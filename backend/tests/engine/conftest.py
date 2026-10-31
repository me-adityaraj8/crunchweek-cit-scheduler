import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

DATA = ROOT / "starter_pack" / "data" / "cit_public.json"
SAMPLE_DISRUPTION = ROOT / "starter_pack" / "examples" / "sample_disruption.json"
EXAMPLE_SCHEDULE = ROOT / "starter_pack" / "examples" / "schedule.example.json"


def _load_validator():
    spec = importlib.util.spec_from_file_location("official_validator", ROOT / "starter_pack" / "validator.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="session")
def V():
    return _load_validator()


@pytest.fixture(scope="session")
def raw():
    return json.loads(DATA.read_text())


@pytest.fixture(scope="session")
def sample_disruption():
    return json.loads(SAMPLE_DISRUPTION.read_text())


def rows(assign):
    return [{"session_id": s, "day": d, "start_period": p, "room_id": r} for s, (d, p, r) in assign.items()]


def random_schedule(raw, seed):
    """Random (mostly invalid) schedule touching every validator code path."""
    import random

    rnd = random.Random(seed)
    days = raw["calendar"]["days"]
    rooms = [r["id"] for r in raw["rooms"]]
    sessions = [{"session_id": s["id"], "day": rnd.choice(days), "start_period": rnd.randint(1, 9),
                 "room_id": rnd.choice(rooms)} for s in raw["sessions"] if rnd.random() > 0.02]
    if sessions and rnd.random() < 0.5:
        sessions.append(dict(sessions[0]))
    bookings = []
    for b in raw["booking_requests"]:
        st = rnd.choice(["approved", "approved", "alternative_offered", "rejected"])
        if st == "rejected":
            bookings.append({"request_id": b["id"], "status": st, "reason": rnd.choice(["", "full"])})
            continue
        w = rnd.choice(b["windows"])
        a = rnd.randint(w["from_period"], max(w["from_period"], w["to_period"] - b["duration_periods"] + 1))
        bookings.append({"request_id": b["id"], "status": st, "day": w["day"], "start_period": a,
                         "end_period": a + b["duration_periods"] - 1,
                         "room_id": b["requested_room"] if b["requested_room"] in rooms else rnd.choice(rooms),
                         "reason": "x"})
    overrides = []
    for s in rnd.sample(raw["sessions"], 3):
        overrides.append({"session_id": s["id"], "day": rnd.choice(days), "start_period": rnd.randint(1, 9),
                          "room_id": rnd.choice(rooms), "displaced_by": rnd.choice(raw["booking_requests"])["id"]})
    exam_days = raw["calendar"]["exam_week"]["days"]
    exams = [{"exam_id": e["id"], "day": rnd.choice(exam_days), "session": rnd.choice(["AM", "PM"]),
              "rooms": rnd.sample(rooms, rnd.randint(1, 4))} for e in raw["exams"] if rnd.random() > 0.05]
    return {"team": "t", "dataset_id": raw["dataset_id"], "sessions": sessions,
            "fest_week": {"bookings": bookings, "session_overrides": overrides}, "exams": exams}
