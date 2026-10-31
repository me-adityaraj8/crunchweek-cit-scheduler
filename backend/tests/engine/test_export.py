from backend.app.core.dataset import load_dataset
from backend.app.core.export import build_schedule
from backend.app.solver.exams import solve_exams
from backend.app.solver.fest import decide_fest
from backend.app.solver.timetable import solve_timetable
from backend.tests.engine.conftest import DATA


def test_full_pipeline_export_is_clean(raw, V, base_assign, base_fest, base_exams):
    ds = load_dataset(DATA)
    sched = build_schedule(ds, base_assign, base_fest, base_exams, team="CIT Scheduler")
    assert set(sched) >= {"team", "dataset_id", "sessions", "fest_week", "exams"}
    assert sched["dataset_id"] == "cit-public-v1"
    rep = V.run(raw, sched)
    assert rep["hard_violation_count"] == 0, rep["hard_violations"][:5]
    assert not [w for w in rep["warnings"] if "No decision" in w]
    for b in sched["fest_week"]["bookings"]:
        assert set(b) <= {"request_id", "status", "day", "start_period", "end_period", "room_id", "reason"}
        if b["status"] == "rejected":
            assert "room_id" not in b


def test_export_without_fest_or_exams():
    ds = load_dataset(DATA)
    sched = build_schedule(ds, {"X": ("MON", 1, "LH-1")}, None, None, team="t")
    assert sched["sessions"] == [{"session_id": "X", "day": "MON", "start_period": 1, "room_id": "LH-1"}]
    assert "fest_week" not in sched and "exams" not in sched
