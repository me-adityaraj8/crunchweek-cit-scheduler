import json

import pytest

from backend.app.core.checker import check_timetable, full_report, soft_score
from backend.app.core.dataset import apply_changes, load_dataset
from backend.app.core.priority import effective_category, outranks
from backend.tests.engine.conftest import DATA, EXAMPLE_SCHEDULE, random_schedule


@pytest.fixture(scope="module")
def ds():
    return load_dataset(DATA)


def _same(ours, theirs):
    assert ours["hard_by_rule"] == theirs["hard_by_rule"]
    assert sorted((v["rule"], v["detail"]) for v in ours["hard_violations"]) == \
        sorted((v["rule"], v["detail"]) for v in theirs["hard_violations"])
    assert ours["soft_total"] == theirs["soft_total"] and ours["soft_penalties"] == theirs["soft_penalties"]
    assert ours.get("bookings") == theirs.get("bookings")
    assert ours.get("exam_soft_penalty") == theirs.get("exam_soft_penalty")
    assert ours["warnings"] == theirs["warnings"]


@pytest.mark.parametrize("seed", range(20))
def test_random_assign_matches_validator(ds, raw, V, seed):
    sched = random_schedule(raw, seed)
    _same(full_report(ds, sched), V.run(raw, sched))


def test_example_schedule_matches_validator(ds, raw, V):
    sched = json.loads(EXAMPLE_SCHEDULE.read_text())
    _same(full_report(ds, sched), V.run(raw, sched))


def test_disruption_with_baseline_matches_validator(ds, raw, V, sample_disruption):
    ds2 = apply_changes(ds, sample_disruption)
    base, after = random_schedule(raw, 1), random_schedule(raw, 2)
    after.pop("exams")
    _same(full_report(ds2, after, base), V.run(V.apply_disruption(raw, sample_disruption), after, base))
    assert full_report(ds2, after, base)["stability"] == V.run(V.apply_disruption(raw, sample_disruption), after, base)["stability"]


def test_empty_assign_reports_every_session_missing(ds):
    v = check_timetable(ds, {})
    assert len([x for x in v if x.rule == "H1"]) == 189
    assert soft_score(ds, {}) == ({k: 0 for k in ("S1", "S2", "S3", "S4", "S5", "S6")}, 0)


def test_club_claiming_institute_is_capped(ds):
    req = {**ds.requests["BR-07"], "requested_category": "institute_event"}
    assert effective_category(ds, req) == "club_event"


def test_outranks_by_category_then_time(ds):
    inst, club = ds.requests["BR-01"], ds.requests["BR-07"]
    assert outranks(ds, inst, club) and not outranks(ds, club, inst)
    early = {**club, "submitted_at": "2000-01-01T00:00:00+05:30"}
    assert outranks(ds, early, club)


def _toy_assign(ds):
    # LH-1 MON P1 taken by one lecture; enough for single-move / single-booking checks
    sid = next(s for s, x in ds.sessions.items() if x["kind"] == "lecture" and x["size"] <= 120 and not x["needs_accessible"])
    return sid, {sid: ("MON", 1, "LH-1")}


def test_check_move_flags_room_clash(ds):
    from backend.app.core.checker import check_move
    sid, assign = _toy_assign(ds)
    other = next(s for s, x in ds.sessions.items()
                 if s != sid and x["kind"] == "lecture" and x["faculty_id"] != ds.sessions[sid]["faculty_id"]
                 and not set(x["groups"]) & set(ds.sessions[sid]["groups"]) and x["size"] <= 200)
    rules = {v.rule for v in check_move(ds, assign, other, "MON", 1, "LH-1")}
    assert "H4" in rules
    assert check_move(ds, assign, sid, "MON", 1, "LH-1") == []


def test_check_booking_and_free_rooms(ds):
    from backend.app.core.checker import check_booking, free_rooms
    sid, assign = _toy_assign(ds)
    draft = {"id": "APP-1", "attendance": 100, "duration_periods": 1, "room_types": ["lecture_hall"],
             "needs": [], "mandatory_for_groups": [], "windows": [{"day": "MON", "from_period": 1, "to_period": 1}]}
    clash = check_booking(ds, assign, {**draft, "day": "MON", "start_period": 1, "end_period": 1, "room_id": "LH-1"}, [])
    assert any(v.rule == "H13" and "already used by" in v.detail for v in clash)
    assert check_booking(ds, assign, {**draft, "day": "MON", "start_period": 1, "end_period": 1, "room_id": "LH-2"}, []) == []
    too_small = check_booking(ds, assign, {**draft, "attendance": 150, "day": "MON", "start_period": 1, "end_period": 1, "room_id": "LH-3"}, [])
    assert any("seats" in v.detail for v in too_small)
    free = free_rooms(ds, assign, [], "MON", 1, 1, 100, [], ["lecture_hall"])
    assert "LH-1" not in free and "LH-2" in free


def test_inversion_checks_every_window_like_validator(ds, raw, V):
    import copy
    raw2 = copy.deepcopy(raw)
    br03 = next(b for b in raw2["booking_requests"] if b["id"] == "BR-03")
    br13 = next(b for b in raw2["booking_requests"] if b["id"] == "BR-13")
    br03["windows"] = [{"day": "WED", "from_period": 1, "to_period": 2}, {"day": "WED", "from_period": 10, "to_period": 11}]
    br03["room_types"], br03["needs"], br03["attendance"] = ["lecture_hall", "classroom"], [], 60
    sched = {"dataset_id": "cit-public-v1", "sessions": [],
             "fest_week": {"bookings": [{"request_id": b["id"], "status": "rejected", "reason": "x"} for b in raw2["booking_requests"] if b["id"] not in ("BR-03", "BR-13")]
                           + [{"request_id": "BR-03", "status": "rejected", "reason": "x"},
                              {"request_id": "BR-13", "status": "approved", "day": "WED", "start_period": 10, "end_period": 11,
                               "room_id": "CR-103", "reason": "x"}], "session_overrides": []}}
    theirs = V.run(raw2, sched)["bookings"]["priority_inversions"]
    assert theirs
    assert full_report(load_dataset(raw2), sched)["bookings"]["priority_inversions"] == theirs
