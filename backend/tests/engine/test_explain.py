import pytest

from backend.app.core.dataset import load_dataset
from backend.app.core.explain import explain_booking, explain_session
from backend.app.solver.fest import decide_fest
from backend.app.solver.timetable import solve_timetable
from backend.tests.engine.conftest import DATA


@pytest.fixture(scope="module")
def ds():
    return load_dataset(DATA)


@pytest.fixture(scope="module")
def solved(ds):
    r = solve_timetable(ds, 60)
    assert r.status == "optimal"
    return r.assign


def test_explain_early_session(ds, solved):
    sid = next(s for s, (d, p, r) in sorted(solved.items()) if p == 1)
    e = explain_session(ds, solved, sid)
    day, start, room = solved[sid]
    assert e["placed_at"] == {"day": day, "start": start, "room": room, "time": "08:00–09:00"}
    assert e["facts"]
    assert e["alternatives"]
    for a in e["alternatives"]:
        assert (a["day"], a["start"]) != (day, start)
        assert a["blocked_by"] or a["soft_delta"] >= 0


def test_explain_unknown_session(ds, solved):
    with pytest.raises(KeyError):
        explain_session(ds, solved, "NOPE")


def test_explain_rejected_booking(ds, solved):
    e = explain_booking(ds, decide_fest(ds, solved), "BR-09")
    assert e["status"] == "rejected" and "800" in e["reason"]
