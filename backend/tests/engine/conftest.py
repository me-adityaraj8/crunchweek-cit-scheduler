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


def pytest_configure(config):
    config.addinivalue_line("markers", "slow: solver-heavy property tests (deselect with -m 'not slow')")


# One solve of the public dataset shared by every module (each solve costs ~20s).
@pytest.fixture(scope="session")
def base_solve():
    from backend.app.core.dataset import load_dataset
    from backend.app.solver.timetable import solve_timetable
    return solve_timetable(load_dataset(DATA), 60)


@pytest.fixture(scope="session")
def base_assign(base_solve):
    assert base_solve.assign is not None, base_solve.status
    return base_solve.assign


@pytest.fixture(scope="session")
def base_fest(base_assign):
    from backend.app.core.dataset import load_dataset
    from backend.app.solver.fest import decide_fest
    return decide_fest(load_dataset(DATA), base_assign)


@pytest.fixture(scope="session")
def base_exams():
    from backend.app.core.dataset import load_dataset
    from backend.app.solver.exams import solve_exams
    return solve_exams(load_dataset(DATA), 30)


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


def assert_same_report(ours, theirs):
    """Our full_report must equal the official validator's run() on everything that is scored."""
    assert ours["hard_violations"] == theirs["hard_violations"]
    assert ours["hard_by_rule"] == theirs["hard_by_rule"]
    assert ours["soft_penalties"] == theirs["soft_penalties"] and ours["soft_total"] == theirs["soft_total"]
    for key in ("bookings", "exam_soft_penalty", "stability"):
        assert ours.get(key) == theirs.get(key), key
    assert ours["warnings"] == theirs["warnings"]


# ---- tiny hand-made datasets (same format as cit_public.json)
def make_raw(base_raw, rooms, faculty, groups, sessions, days=("MON",), requests=(), exams=(), room_unavailability=()):
    import copy as _copy
    cal = _copy.deepcopy(base_raw["calendar"])
    cal["days"] = list(days)
    return {"dataset_id": "tiny", "calendar": cal, "priority_order": list(base_raw["priority_order"]),
            "role_category_cap": dict(base_raw["role_category_cap"]), "rooms": list(rooms),
            "room_unavailability": list(room_unavailability), "faculty": list(faculty), "student_groups": list(groups),
            "courses": [], "sessions": list(sessions), "booking_requests": list(requests), "cancellations": [],
            "exams": list(exams)}


def room(rid, rtype="classroom", cap=60, accessible=True, uses=("lecture", "tutorial", "exam", "event"), features=()):
    return {"id": rid, "name": rid, "building": "T", "type": rtype, "capacity": cap, "features": list(features),
            "accessible": accessible, "allowed_uses": list(uses)}


def fac(fid, max_h=9, unavailable=(), prefs=()):
    return {"id": fid, "name": fid, "department": "T", "max_hours_per_day": max_h, "needs_accessible": False,
            "unavailable": list(unavailable), "preferences": list(prefs)}


def grp(gid, size=50):
    return {"id": gid, "name": gid, "year": 1, "department": "T", "size": size, "needs_accessible": False}


def sess(sid, course, kind="lecture", groups=("G1",), faculty="F1", size=50, duration=1, room_types=("classroom",),
         basket=None, fixed=None, accessible=False):
    return {"id": sid, "course_id": course, "kind": kind, "groups": list(groups), "faculty_id": faculty, "size": size,
            "duration": duration, "room_types": list(room_types), "needs_accessible": accessible,
            "basket_slot": basket, "fixed_slot": fixed}
