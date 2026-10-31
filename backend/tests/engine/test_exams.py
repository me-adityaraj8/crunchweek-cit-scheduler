import pytest

from backend.app.core.checker import check_exams
from backend.app.core.dataset import load_dataset
from backend.app.solver.exams import solve_exams
from backend.tests.engine.conftest import DATA


@pytest.fixture(scope="module")
def ds():
    return load_dataset(DATA)


def test_exams_valid_and_penalty_matches_validator(ds, raw, V):
    r = solve_exams(ds, time_limit_s=30)
    assert r.status in ("optimal", "feasible")
    viol, pen = check_exams(ds, r.exams)
    assert viol == []
    assert sorted(e["exam_id"] for e in r.exams) == sorted(e["id"] for e in raw["exams"])
    rep = V.run(raw, {"dataset_id": ds.dataset_id, "sessions": [], "exams": r.exams})
    assert [v for v in rep["hard_violations"] if v["where"] == "exams"] == []
    assert rep["exam_soft_penalty"] == r.penalty == pen


def test_exam_rooms_seat_half_capacity(ds):
    r = solve_exams(ds, time_limit_s=30)
    size = {e["id"]: e["size"] for e in ds.exams}
    for e in r.exams:
        assert sum(ds.rooms[x]["capacity"] // 2 for x in e["rooms"]) >= size[e["exam_id"]]
        assert all("exam" in ds.rooms[x]["allowed_uses"] for x in e["rooms"])
