"""Repair: validity under the official validator, minimal moves (checked against an independent
moves-only optimum), and named conflicts when no fix exists."""
import copy
import random
from dataclasses import asdict

import pytest

from backend.app.core.checker import check_timetable
from backend.app.core.dataset import apply_changes, load_dataset
from backend.app.solver import repair as repair_mod
from backend.app.solver.fest import FestResult
from backend.app.solver.model_builder import build
from backend.app.solver.repair import commitments, repair
from backend.app.solver.timetable import run_model
from backend.tests.engine.conftest import DATA, rows


@pytest.fixture(scope="module")
def ds():
    return load_dataset(DATA)


def _sched(ds, assign, fest=None):
    out = {"dataset_id": ds.dataset_id, "sessions": rows(assign)}
    if fest is not None:
        out["fest_week"] = {"bookings": [asdict(d) for d in fest.decisions], "session_overrides": fest.overrides}
    return out


def min_moves(ds2, base, rooms, groups, limit=60):
    """Fewest sessions that must change, ignoring soft penalties entirely."""
    tm = build(ds2, blocked=frozenset(rooms), baseline=base, move_weight=1, blocked_groups=frozenset(groups))
    status, solver = run_model(tm, limit, 8, sum(tm.move_terms))
    assert status == "optimal", status
    return round(solver.ObjectiveValue())


def must_move(ds2, base):
    """Sessions whose old slot now breaks a single-session rule (unavailability, closure...)."""
    base_in = {s: v for s, v in base.items() if s in ds2.sessions}
    return {v.detail.split(":")[0] for v in check_timetable(ds2, base_in) if v.rule in ("H7", "H8")}


def check_repair(ds, raw, V, base, fest, change, r):
    ds2 = apply_changes(ds, change)
    rep = V.run(V.apply_disruption(raw, change), _sched(ds, r.assign, r.fest), baseline=_sched(ds, base))
    assert rep["hard_violation_count"] == 0, rep["hard_violations"][:5]
    assert rep["bookings"]["priority_inversions"] == [] and rep["warnings"] == []
    assert rep["stability"]["sessions_moved"] == r.moved
    assert r.moved >= len(must_move(ds2, base))
    base_in = {s: v for s, v in base.items() if s in ds2.sessions}
    released = any("could not be fixed while keeping" in c.text for c in r.conflicts)
    rooms, groups = (set(), set()) if released else commitments(ds2, fest)
    assert r.proven_minimal
    assert r.moved == min_moves(ds2, base_in, rooms, groups)


def test_sample_disruption_is_proven_minimal(ds, raw, V, base_assign, base_fest, sample_disruption):
    r = repair(apply_changes(ds, sample_disruption), base_assign, base_fest, 60)
    assert r.status == "ok"
    check_repair(ds, raw, V, base_assign, base_fest, sample_disruption, r)


def random_change(ds, seed):
    rnd = random.Random(seed)
    changes, removed = [], set()
    teaching = [r["id"] for r in ds.rooms.values() if {"lecture", "lab"} & set(r["allowed_uses"])]
    for i in range(rnd.randint(1, 3)):
        kind = rnd.choice(["fac", "room", "add", "remove"])
        if kind == "fac":
            changes.append({"type": "faculty_unavailable", "faculty_id": rnd.choice(sorted(ds.faculty)),
                            "days": rnd.sample(ds.days, rnd.randint(1, 2)),
                            "periods": sorted(rnd.sample(range(1, 10), rnd.randint(2, 9))), "reason": "qa"})
        elif kind == "room":
            changes.append({"type": "room_unavailable", "room_id": rnd.choice(teaching),
                            "days": rnd.sample(ds.days, rnd.randint(1, 3)), "periods": list(range(1, 10)),
                            "reason": "qa"})
        elif kind == "add":
            g = rnd.choice(sorted(ds.groups))
            changes.append({"type": "add_session", "session": {
                "id": f"QA-{seed}-{i}", "course_id": "QA1", "kind": "tutorial", "groups": [g],
                "faculty_id": rnd.choice(sorted(ds.faculty)), "size": ds.groups[g]["size"], "duration": 1,
                "room_types": ["classroom", "lecture_hall", "auditorium"], "needs_accessible": False,
                "basket_slot": None, "fixed_slot": None}})
        else:
            sid = rnd.choice(sorted(s for s in ds.sessions if not ds.sessions[s].get("basket_slot") and s not in removed))
            removed.add(sid)
            changes.append({"type": "remove_session", "session_id": sid})
    return {"changes": changes}


@pytest.mark.slow
@pytest.mark.parametrize("seed", range(5))
def test_random_disruptions_are_valid_and_minimal(seed, ds, raw, V, base_assign, base_fest):
    change = random_change(ds, seed)
    r = repair(apply_changes(ds, change), base_assign, base_fest, 60)
    assert r.status in ("ok", "infeasible"), r.status
    if r.status == "infeasible":
        assert r.conflicts and all(c.text for c in r.conflicts)
        return
    check_repair(ds, raw, V, base_assign, base_fest, change, r)


# ---------------------------------------------------------------- no valid fix
def test_all_cs_labs_closed_names_both_labs(ds, base_assign, base_fest):
    change = {"changes": [{"type": "room_unavailable", "room_id": rid, "days": list(ds.days),
                           "periods": list(range(1, 10)), "reason": "qa"}
                          for rid, r in ds.rooms.items() if r["type"] == "lab_cs"]}
    r = repair(apply_changes(ds, change), base_assign, base_fest, 30)
    assert r.status == "infeasible" and r.assign is None
    text = " ".join(c.text for c in r.conflicts)
    for rid, x in ds.rooms.items():
        if x["type"] == "lab_cs":
            assert rid in text


def test_daily_limit_conflict_is_named(ds, base_assign):
    hours = {}
    for s in ds.sessions.values():
        if not s.get("basket_slot"):
            hours[s["faculty_id"]] = hours.get(s["faculty_id"], 0) + s["duration"]
    f = next(f for f, h in sorted(hours.items()) if h > ds.faculty[f].get("max_hours_per_day", 4) and not ds.fac_un[f])
    change = {"changes": [{"type": "faculty_unavailable", "faculty_id": f, "days": list(ds.days[:4]),
                           "periods": list(range(1, 10)), "reason": "qa"}]}
    r = repair(apply_changes(ds, change), base_assign, None, 30)
    assert r.status == "infeasible"
    kinds = {c.code for c in r.conflicts}
    assert {"fac_un", "daily"} <= kinds and all(f in c.text for c in r.conflicts if c.code in ("fac_un", "daily"))


def test_group_overload_with_electives_is_named(ds, base_assign):
    g = next(g for g in sorted(ds.groups) if any(g in s["groups"] and s.get("basket_slot") for s in ds.sessions.values()))
    week = len(ds.days) * 9
    busy = {(d, p) for s, (d, st, _) in base_assign.items() if g in ds.sessions[s]["groups"]
            for p in range(st, st + ds.sessions[s]["duration"])}
    extra = week - len(busy) + 1                       # one hour more than the week can hold
    changes = []
    for i in range(extra):
        changes.append({"type": "add_faculty", "faculty": {"id": f"QF{i}", "name": f"QF{i}", "max_hours_per_day": 4}})
        changes.append({"type": "add_session", "session": {
            "id": f"QO-{i}", "course_id": f"QO{i}", "kind": "tutorial", "groups": [g], "faculty_id": f"QF{i}",
            "size": ds.groups[g]["size"], "duration": 1, "room_types": ["classroom", "lecture_hall", "auditorium"],
            "needs_accessible": False, "basket_slot": None, "fixed_slot": None}})
    r = repair(apply_changes(ds, {"changes": changes}), base_assign, None, 60)
    assert r.status == "infeasible"
    assert any(c.code == "group_clash" and g in c.text for c in r.conflicts), [c.text for c in r.conflicts]


def test_session_needing_missing_room_type_is_named(ds, base_assign):
    change = {"changes": [{"type": "add_session", "session": {
        "id": "QX-1", "course_id": "QX", "kind": "lecture", "groups": ["Y1-A"], "faculty_id": "F01", "size": 30,
        "duration": 1, "room_types": ["planetarium"], "needs_accessible": False, "basket_slot": None,
        "fixed_slot": None}}]}
    r = repair(apply_changes(ds, change), base_assign, None, 10)
    assert r.status == "infeasible" and any(c.code == "session" and "QX-1" in c.text for c in r.conflicts)


def test_repair_never_returns_ok_with_invalid_bookings(ds, base_assign, base_fest, sample_disruption, monkeypatch):
    broken = copy.deepcopy(base_fest)
    d = next(x for x in broken.decisions if x.request_id == "BR-01")
    d.room_id = "CR-205"                                 # seats 60, BR-01 needs 450
    monkeypatch.setattr(repair_mod, "decide_fest", lambda *a, **k: FestResult(broken.decisions, broken.overrides))
    r = repair(apply_changes(ds, sample_disruption), base_assign, base_fest, 60)
    assert r.status != "ok"
    assert any("BR-01" in c.text for c in r.conflicts if c.code == "booking")


def test_overload_is_answered_quickly(ds, base_assign):
    import time
    g = sorted(ds.groups)[0]
    changes = []
    for i in range(46):
        changes.append({"type": "add_faculty", "faculty": {"id": f"QZ{i}", "name": "z", "max_hours_per_day": 4}})
        changes.append({"type": "add_session", "session": {
            "id": f"QZ-{i}", "course_id": "QZ", "kind": "tutorial", "groups": [g], "faculty_id": f"QZ{i}",
            "size": 10, "duration": 1, "room_types": ["classroom"]}})
    t0 = time.monotonic()
    r = repair(apply_changes(ds, {"changes": changes}), base_assign, None, 60)
    assert r.status == "infeasible" and time.monotonic() - t0 < 15
    assert any(g in c.text and "hours" in c.text for c in r.conflicts)


def test_faculty_daily_limit_without_unavailability_is_named(ds, base_assign):
    changes = [{"type": "add_faculty", "faculty": {"id": "QD", "name": "QD", "max_hours_per_day": 1}}]
    for i in range(6):                                   # 6 hours, at most 1 a day over 5 days
        changes.append({"type": "add_session", "session": {
            "id": f"QD-{i}", "course_id": f"QD{i}", "kind": "tutorial", "groups": [sorted(ds.groups)[i % 3]],
            "faculty_id": "QD", "size": 10, "duration": 1, "room_types": ["classroom", "lecture_hall"]}})
    r = repair(apply_changes(ds, {"changes": changes}), base_assign, None, 60)
    assert r.status == "infeasible"
    assert any(c.code == "daily" and "QD" in c.text for c in r.conflicts)


def test_timeout_on_an_impossible_change_still_names_the_cause(ds, base_assign, monkeypatch):
    from backend.app.solver.timetable import SolveResult
    monkeypatch.setattr(repair_mod, "solve_timetable", lambda *a, **k: SolveResult("timeout", None, {}, 0, 0))
    change = {"changes": [{"type": "room_unavailable", "room_id": rid, "days": list(ds.days),
                           "periods": list(range(1, 10)), "reason": "qa"}
                          for rid, x in ds.rooms.items() if x["type"] == "lab_cs"]}
    r = repair(apply_changes(ds, change), base_assign, None, 10)
    assert r.status == "infeasible" and any("CS-LAB" in c.text for c in r.conflicts)
    r2 = repair(ds, base_assign, None, 10)               # feasible problem that "timed out"
    assert r2.status == "timeout"


def test_booking_in_a_week7_only_free_cell_does_not_force_permanent_moves(ds, base_assign, base_fest):
    """A booking can sit in a cell that a class only vacated for Week 7. Repairing an unchanged dataset
    must not move that class for good."""
    from backend.app.solver.fest import Decision
    sid, (d, p, rm) = next((s, v) for s, v in sorted(base_assign.items())
                           if ds.sessions[s]["duration"] == 1 and v[2].startswith("LH") and v[1] <= 9)
    fake = FestResult([Decision("BR-12", "approved", d, p, p, rm, reason="x")], [])
    r = repair(ds, base_assign, fake, 30)
    assert r.status == "ok" and r.moved == 0, [m for m in r.diff]


def test_simple_repairs_are_fast(ds, base_assign, base_fest, sample_disruption):
    import time
    t0 = time.monotonic()
    r = repair(apply_changes(ds, sample_disruption), base_assign, base_fest, 60)
    took = time.monotonic() - t0
    assert r.status == "ok" and r.proven_minimal
    assert took < 15, f"repair took {took:.1f}s"


def test_fixed_sessions_stay_put(ds, base_assign):
    from backend.app.solver.timetable import solve_timetable
    keep = dict(list(sorted(base_assign.items()))[:150])
    r = solve_timetable(ds, 20, baseline=base_assign, move_weight=1000, fixed=keep)
    assert r.assign and all(r.assign[s] == v for s, v in keep.items())
