"""The base timetable should leave room for Spectra bookings that are mandatory for a group, without
giving up any of the validator's soft score."""
from dataclasses import asdict

from backend.app.core.checker import check_fest
from backend.app.core.dataset import load_dataset
from backend.app.core.priority import mandatory_cells
from backend.tests.engine.conftest import DATA


def test_mandatory_cells_cover_teaching_periods_only():
    ds = load_dataset(DATA)
    cells = mandatory_cells(ds)
    assert cells[("ECE-3", "THU", 8)] == 3                 # BR-08, department event
    assert ("CSE-3", "WED", 10) not in cells               # BR-13 is in the evening: no class can clash
    assert all(1 <= p <= 9 for (_, _, p) in cells)


def test_base_timetable_is_optimal_and_booking_friendly(base_solve, base_fest):
    ds = load_dataset(DATA)
    assert base_solve.status == "optimal" and base_solve.soft_total == 3
    status = {d.request_id: d.status for d in base_fest.decisions}
    assert status["BR-08"] == status["BR-18"] == status["BR-19"] == "approved"
    _, _, stats = check_fest(ds, base_solve.assign, [asdict(d) for d in base_fest.decisions], base_fest.overrides)
    assert stats["booking_score"] == 67.0                  # 70 minus BR-09 (impossible) and half of BR-17
