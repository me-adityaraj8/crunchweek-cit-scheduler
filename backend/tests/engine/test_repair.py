from dataclasses import asdict

import pytest

from backend.app.core.checker import check_fest, check_timetable
from backend.app.core.dataset import apply_changes, load_dataset
from backend.app.solver.fest import decide_fest
from backend.app.solver.repair import repair
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


def _sched(ds, assign):
    return {"dataset_id": ds.dataset_id, "sessions": rows(assign)}


def test_sample_disruption_minimal_and_valid(ds, raw, V, base, fest, sample_disruption):
    ds2 = apply_changes(ds, sample_disruption)
    hit = {v.detail.split(":")[0] for v in check_timetable(ds2, base) if v.rule in ("H7", "H8")}
    r = repair(ds2, base, fest, 60)
    assert r.status == "ok" and check_timetable(ds2, r.assign) == []
    rep = V.run(V.apply_disruption(raw, sample_disruption), _sched(ds, r.assign), baseline=_sched(ds, base))
    assert rep["hard_violation_count"] == 0
    assert rep["stability"]["sessions_moved"] == r.moved
    assert r.moved <= len(hit) + 1
    assert {m.session_id for m in r.diff} >= hit | {"CS202-T2"}
    assert r.time_changed + r.room_only == r.moved


def test_repair_keeps_spectra_bookings_valid(ds, base, fest, sample_disruption):
    ds2 = apply_changes(ds, sample_disruption)
    r = repair(ds2, base, fest, 60)
    viol, _, stats = check_fest(ds2, r.assign, [asdict(d) for d in r.fest.decisions], r.overrides)
    assert viol == [] and stats["priority_inversions"] == []


def test_unchanged_dataset_moves_nothing(ds, base):
    r = repair(ds, base, None, 30)
    assert r.status == "ok" and r.moved == 0 and r.diff == []


def test_repair_infeasible_names_conflicts(ds, base):
    f = next(iter(ds.faculty))
    ds2 = apply_changes(ds, {"changes": [{"type": "faculty_unavailable", "faculty_id": f, "days": list(ds.days),
                                          "periods": list(range(1, 10)), "reason": "x"}]})
    r = repair(ds2, base, None, 30)
    assert r.status == "infeasible" and r.assign is None
    assert r.conflicts and any(f in c.text for c in r.conflicts)


def test_room_closure_breaking_a_booking_is_reported(ds, base, fest):
    d = next(d for d in fest.decisions if d.status == "approved" and d.room_id == "SH-1")
    ds2 = apply_changes(ds, {"changes": [{"type": "room_unavailable", "room_id": "SH-1", "days": [d.day],
                                          "periods": list(range(d.start_period, d.end_period + 1)), "reason": "x"}]})
    r = repair(ds2, base, fest, 30)
    assert r.status == "ok"
    assert any(c.text.startswith(d.request_id) and c.code == "booking_changed" for c in r.conflicts)
    assert not [c for c in r.conflicts if c.code == "booking"]


def test_conflict_text_lists_days_in_week_order(ds, base):
    f = next(iter(ds.faculty))
    ds2 = apply_changes(ds, {"changes": [{"type": "faculty_unavailable", "faculty_id": f, "days": list(ds.days),
                                          "periods": list(range(1, 10)), "reason": "x"}]})
    text = next(c.text for c in repair(ds2, base, None, 30).conflicts if f in c.text)
    assert text.index("MON") < text.index("TUE") < text.index("FRI")


def _crowded(ds, base):
    """Base timetable with a lecture in AUD MON P4, so BR-01 has to displace it in Week 7."""
    from backend.app.core.checker import check_move
    for sid, s in ds.sessions.items():
        if "auditorium" in s["room_types"] and s["duration"] == 1 and not s.get("basket_slot") and not s.get("fixed_slot"):
            if not check_move(ds, base, sid, "MON", 4, "AUD"):
                return sid, {**base, sid: ("MON", 4, "AUD")}
    raise AssertionError("no lecture can sit in AUD MON P4")


def test_repair_with_week7_overrides(ds, raw, V, base, sample_disruption):
    sid, crowded = _crowded(ds, base)
    fest = decide_fest(ds, crowded)
    assert fest.overrides
    ds2 = apply_changes(ds, sample_disruption)
    hit = {v.detail.split(":")[0] for v in check_timetable(ds2, crowded) if v.rule in ("H7", "H8")}
    r = repair(ds2, crowded, fest, 60)
    assert r.status == "ok"
    assert r.assign[sid] == crowded[sid] or sid in hit          # displaced class keeps its normal slot
    assert r.moved <= len(hit) + 1
    viol, _, stats = check_fest(ds2, r.assign, [asdict(d) for d in r.fest.decisions], r.overrides)
    assert viol == [] and stats["priority_inversions"] == []
    sched = _after_sched(ds, r)
    rep = V.run(V.apply_disruption(raw, sample_disruption), sched, baseline=_sched(ds, crowded))
    assert rep["hard_violation_count"] == 0, rep["hard_violations"][:3]


def _after_sched(ds, r):
    return {"dataset_id": ds.dataset_id, "sessions": rows(r.assign),
            "fest_week": {"bookings": [asdict(d) for d in r.fest.decisions], "session_overrides": r.fest.overrides}}


def test_room_closure_re_decides_bookings_and_stays_valid(ds, raw, V, base, fest):
    change = {"changes": [{"type": "room_unavailable", "room_id": "CR-105", "days": list(ds.days),
                           "periods": list(range(1, 10)), "reason": "x"}]}
    r = repair(apply_changes(ds, change), base, fest, 60)
    assert r.status == "ok"
    rep = V.run(V.apply_disruption(raw, change), _after_sched(ds, r), baseline=_sched(ds, base))
    assert rep["hard_violation_count"] == 0, rep["hard_violations"][:3]
    assert rep["bookings"]["priority_inversions"] == []
    changed = {c.text.split(":")[0] for c in r.conflicts if c.code == "booking_changed"}
    was_cr105 = {d.request_id for d in fest.decisions if d.room_id == "CR-105"}
    assert was_cr105 and was_cr105 <= changed


def test_permanent_class_not_vetoed_by_one_week_booking(ds, base, fest):
    br08 = next(d for d in fest.decisions if d.request_id == "BR-08")
    assert br08.status == "approved"
    size = ds.groups["ECE-3"]["size"]
    change = {"changes": [
        {"type": "add_faculty", "faculty": {"id": "F99", "name": "New", "department": "ECE", "max_hours_per_day": 4,
                                             "needs_accessible": False, "unavailable": [], "preferences": []}},
        {"type": "add_session", "session": {"id": "EC399-L1", "course_id": "EC399", "kind": "lecture", "groups": ["ECE-3"],
                                             "faculty_id": "F99", "size": size, "duration": 1,
                                             "room_types": ["classroom", "lecture_hall"], "needs_accessible": False,
                                             "basket_slot": None, "fixed_slot": {"day": br08.day, "start_period": br08.start_period}}}]}
    ds2 = apply_changes(ds, change)
    r = repair(ds2, base, fest, 60)
    assert r.status == "ok" and r.assign["EC399-L1"][:2] == (br08.day, br08.start_period)
    viol, _, _ = check_fest(ds2, r.assign, [asdict(d) for d in r.fest.decisions], r.fest.overrides)
    assert viol == []
