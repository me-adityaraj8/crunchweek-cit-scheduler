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
    viol, _, stats = check_fest(ds2, r.assign, [asdict(d) for d in fest.decisions], fest.overrides)
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
    assert any(d.request_id in c.text and c.code == "booking" for c in r.conflicts)


def test_conflict_text_lists_days_in_week_order(ds, base):
    f = next(iter(ds.faculty))
    ds2 = apply_changes(ds, {"changes": [{"type": "faculty_unavailable", "faculty_id": f, "days": list(ds.days),
                                          "periods": list(range(1, 10)), "reason": "x"}]})
    text = next(c.text for c in repair(ds2, base, None, 30).conflicts if f in c.text)
    assert text.index("MON") < text.index("TUE") < text.index("FRI")
