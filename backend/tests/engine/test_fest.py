from dataclasses import asdict

import pytest

from backend.app.core.checker import check_fest
from backend.app.core.dataset import load_dataset
from backend.app.solver.fest import decide_fest
from backend.app.solver.timetable import solve_timetable
from backend.tests.engine.conftest import DATA, rows


@pytest.fixture(scope="module")
def ds():
    return load_dataset(DATA)


@pytest.fixture(scope="module")
def base(ds):
    return solve_timetable(ds, 60).assign


@pytest.fixture(scope="module")
def fest(ds, base):
    return decide_fest(ds, base)


def _by(f, rid):
    return next(d for d in f.decisions if d.request_id == rid)


def test_fest_valid_and_inversion_free(ds, base, fest):
    viol, warn, stats = check_fest(ds, base, [asdict(d) for d in fest.decisions], fest.overrides)
    assert viol == [] and warn == [] and stats["priority_inversions"] == []
    assert {d.request_id for d in fest.decisions} == set(ds.requests)
    assert all(d.reason for d in fest.decisions)


def test_official_validator_agrees(ds, raw, V, base, fest):
    sched = {"dataset_id": ds.dataset_id, "sessions": rows(base),
             "fest_week": {"bookings": [asdict(d) for d in fest.decisions], "session_overrides": fest.overrides}}
    rep = V.run(raw, sched)
    assert [v for v in rep["hard_violations"] if v["where"] != "exams"] == []
    assert rep["bookings"]["priority_inversions"] == []


def test_cancelled_and_impossible_requests_rejected_with_reasons(fest):
    assert _by(fest, "BR-04").status == "rejected" and "Cancelled" in _by(fest, "BR-04").reason
    br09 = _by(fest, "BR-09")
    assert br09.status == "rejected" and "1200" in br09.reason.replace(",", "")


def test_nonexistent_requested_room_is_noted(fest):
    d = _by(fest, "BR-14")
    assert any("LHC-5" in f for f in d.facts)


def test_only_institute_events_displace_sessions(ds, fest):
    from backend.app.core.priority import effective_category
    for o in fest.overrides:
        assert effective_category(ds, ds.requests[o["displaced_by"]]) == "institute_event"


def test_higher_priority_extra_bumps_lower(ds, base, fest):
    club = next(d for d in fest.decisions if d.status == "approved"
                and ds.requests[d.request_id]["requested_category"] == "club_event"
                and ds.requests[d.request_id]["role"] == "club")
    req = ds.requests[club.request_id]
    extra = {**req, "id": "APP-0001", "role": "faculty", "requested_category": "guest_lecture",
             "submitted_at": "2027-02-10T10:00:00+05:30", "requested_room": club.room_id,
             "windows": [{"day": club.day, "from_period": club.start_period, "to_period": club.end_period}],
             "room_types": [ds.rooms[club.room_id]["type"]]}
    f2 = decide_fest(ds, base, extra_requests=[extra])
    app = _by(f2, "APP-0001")
    assert app.status == "approved" and app.room_id == club.room_id
    bumped = _by(f2, club.request_id)
    assert (bumped.room_id, bumped.day, bumped.start_period) != (club.room_id, club.day, club.start_period) or bumped.status == "rejected"


def test_reason_times_follow_calendar(fest):
    d = _by(fest, "BR-03")
    assert (d.day, d.start_period) == ("WED", 6)
    assert f"WED 14:00–{14 + d.end_period - d.start_period + 1}:00" in d.reason


def test_institute_event_displaces_class_when_needed(ds, raw, V, base):
    from backend.app.core.checker import check_move
    # put some movable lecture into AUD MON P4 so BR-01 (AUD MON P4-5) has to displace it
    crowded = None
    for sid, s in ds.sessions.items():
        if "auditorium" in s["room_types"] and s["duration"] == 1 and not s.get("basket_slot") and not s.get("fixed_slot"):
            if not check_move(ds, base, sid, "MON", 4, "AUD"):
                crowded = {**base, sid: ("MON", 4, "AUD")}
                break
    assert crowded, "no lecture can sit in AUD MON P4"
    f = decide_fest(ds, crowded)
    br01 = _by(f, "BR-01")
    assert br01.status == "approved" and br01.room_id == "AUD" and sid in br01.displaces
    assert any(o["session_id"] == sid and o["displaced_by"] == "BR-01" for o in f.overrides)
    sched = {"dataset_id": ds.dataset_id, "sessions": rows(crowded),
             "fest_week": {"bookings": [asdict(d) for d in f.decisions], "session_overrides": f.overrides}}
    rep = V.run(raw, sched)
    assert [v for v in rep["hard_violations"] if v["where"] != "exams"] == []
