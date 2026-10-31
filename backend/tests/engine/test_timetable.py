import pytest

from backend.app.core.checker import check_timetable, soft_score
from backend.app.core.dataset import load_dataset
from backend.app.solver.timetable import candidates, solve_timetable
from backend.tests.engine.conftest import DATA, rows


@pytest.fixture(scope="module")
def ds():
    return load_dataset(DATA)


@pytest.fixture(scope="module")
def solved(base_solve):
    return base_solve


def test_zero_hard_on_public_dataset(ds, raw, V, solved):
    r = solved
    assert r.status in ("optimal", "feasible") and len(r.assign) == 189
    assert check_timetable(ds, r.assign) == []
    rep = V.run(raw, {"dataset_id": ds.dataset_id, "sessions": rows(r.assign)})
    assert [v for v in rep["hard_violations"] if v["where"] == "timetable"] == []
    assert rep["soft_total"] == r.soft_total == soft_score(ds, r.assign)[1]


def test_basket_sessions_share_slot(ds, solved):
    slots = {}
    for sid, (d, p, _) in solved.assign.items():
        b = ds.sessions[sid].get("basket_slot")
        if b:
            slots.setdefault(b, set()).add((d, p))
    assert slots and all(len(v) == 1 for v in slots.values())


def test_candidates_respect_lab_starts_and_lunch(ds):
    for s in ds.sessions.values():
        cands = candidates(ds, s)
        assert cands, s["id"]
        for d, p, r in cands:
            per = range(p, p + s["duration"])
            assert not (per[0] <= 5 < per[-1]) and per[-1] <= 9
            if s["kind"] == "lab":
                assert p in (2, 6)


def test_blocked_cells_are_avoided(ds, solved):
    sid, (d, p, room) = next(iter(solved.assign.items()))
    r = solve_timetable(ds, time_limit_s=30, baseline=solved.assign, move_weight=1000, blocked={(room, d, p)})
    assert r.status in ("optimal", "feasible")
    for s2, (d2, p2, r2) in r.assign.items():
        assert not (r2 == room and d2 == d and p in range(p2, p2 + ds.sessions[s2]["duration"]))
    assert check_timetable(ds, r.assign) == []
