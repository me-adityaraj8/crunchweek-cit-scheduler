"""Malformed inputs, edge-case datasets and randomized Spectra requests."""
import copy
import json
import random
import time
from dataclasses import asdict

import pytest

from backend.app.core.checker import check_fest, check_move, check_timetable
from backend.app.core.dataset import DatasetError, apply_changes, load_dataset
from backend.app.core.explain import explain_session
from backend.app.solver import fest as fest_mod
from backend.app.solver.exams import solve_exams
from backend.app.solver.fest import decide_fest
from backend.app.solver.model_builder import build, candidates
from backend.app.solver.timetable import SolveResult, solve_timetable
from backend.tests.engine.conftest import DATA, fac, grp, make_raw, room, rows, sess


@pytest.fixture(scope="module")
def ds():
    return load_dataset(DATA)


# ---------------------------------------------------------------- dataset files
def _broken(raw, path, value=None, drop=None):
    r = copy.deepcopy(raw)
    obj = r
    for k in path[:-1]:
        obj = obj[k]
    if drop:
        obj[path[-1]].pop(drop)
    else:
        obj[path[-1]] = value
    return r


@pytest.mark.parametrize("mutation, needle", [
    (lambda r: [], "object"),
    (lambda r: _broken(r, ["sessions"], {"a": 1}), "sessions"),
    (lambda r: _broken(r, ["sessions", 0], drop="duration"), "duration"),
    (lambda r: _broken(r, ["sessions", 0, "faculty_id"], "F999"), "F999"),
    (lambda r: _broken(r, ["sessions", 0, "duration"], 0), "duration"),
    (lambda r: _broken(r, ["sessions", 0, "room_types"], "classroom"), "room_types"),
    (lambda r: _broken(r, ["rooms", 0], drop="capacity"), "capacity"),
    (lambda r: _broken(r, ["faculty", 0, "unavailable"], [{"day": "MON"}]), "periods"),
    (lambda r: _broken(r, ["calendar"], drop="days"), "days"),
    (lambda r: _broken(r, ["calendar"], drop="exam_week"), "exam_week"),
    (lambda r: _broken(r, ["booking_requests", 0], drop="windows"), "windows"),
    (lambda r: _broken(r, ["exams", 0], drop="size"), "size"),
])
def test_malformed_dataset_is_a_clear_error(raw, mutation, needle):
    with pytest.raises(DatasetError, match=needle):
        load_dataset(mutation(raw))


def test_bad_json_file_is_a_dataset_error(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text("{not json")
    with pytest.raises(DatasetError, match="JSON"):
        load_dataset(p)


def test_change_file_is_not_mutated_or_aliased(ds):
    change = {"changes": [
        {"type": "add_faculty", "faculty": {"id": "F99", "name": "N", "max_hours_per_day": 4}},
        {"type": "add_session", "session": {"id": "X1", "course_id": "X", "kind": "lecture", "groups": ["Y1-A"],
                                             "faculty_id": "F99", "size": 10, "duration": 1,
                                             "room_types": ["classroom"]}}]}
    snapshot = copy.deepcopy(change)
    ds2 = apply_changes(ds, change)
    assert change == snapshot                       # caller's file untouched
    change["changes"][1]["session"]["size"] = 999   # later edits must not leak into the dataset
    assert ds2.sessions["X1"]["size"] == 10


# ---------------------------------------------------------------- solver edge cases
def test_fixed_slots_away_from_base_are_respected(ds, raw, V, base_assign):
    r = copy.deepcopy(raw)
    assign = dict(base_assign)
    fixed = {}
    for s in [x for x in r["sessions"] if x["duration"] == 1 and not x.get("basket_slot")][:40]:
        if len(fixed) == 3:
            break
        for d in ds.days:
            for p in (2, 7):
                if (d, p) == assign[s["id"]][:2]:
                    continue
                room_ok = next((rm for rm in ds.rooms if not check_move(ds, assign, s["id"], d, p, rm)), None)
                if room_ok:
                    assign[s["id"]] = (d, p, room_ok)
                    fixed[s["id"]] = (d, p)
                    break
            if s["id"] in fixed:
                break
    assert len(fixed) == 3
    for s in r["sessions"]:
        if s["id"] in fixed:
            s["fixed_slot"] = {"day": fixed[s["id"]][0], "start_period": fixed[s["id"]][1]}
    res = solve_timetable(load_dataset(r), 40)
    assert res.status in ("optimal", "feasible")
    for sid, (d, p) in fixed.items():
        assert res.assign[sid][:2] == (d, p)
    rep = V.run(r, {"dataset_id": ds.dataset_id, "sessions": rows(res.assign)})
    assert [v for v in rep["hard_violations"] if v["where"] == "timetable"] == []


def test_room_types_without_matching_use_still_get_a_room(raw, V):
    tiny = make_raw(raw, rooms=[room("SH", "seminar_hall", 100, uses=("exam", "event"))],
                    faculty=[fac("F1")], groups=[grp("G1", 40)],
                    sessions=[sess("T1", "C1", kind="tutorial", size=40, room_types=["seminar_hall"])])
    res = solve_timetable(load_dataset(tiny), 10)
    assert res.status == "optimal" and res.assign["T1"][2] == "SH"
    assert V.check_timetable(V.Ctx(tiny), res.assign, "t")[0] == []


def test_undeclared_group_still_gets_soft_terms(raw):
    sessions = [sess("A", "C1", groups=["GX"]), sess("B", "C2", groups=["GX"])]
    declared = make_raw(raw, [room("R1")], [fac("F1")], [grp("GX")], sessions)
    undeclared = make_raw(raw, [room("R1")], [fac("F1")], [], sessions)
    assert len(build(load_dataset(undeclared)).soft_terms) == len(build(load_dataset(declared)).soft_terms)


def test_session_with_no_possible_room_is_infeasible_not_a_crash(raw):
    tiny = make_raw(raw, [room("R1")], [fac("F1")], [grp("G1")], [sess("A", "C1", room_types=["planetarium"])])
    assert solve_timetable(load_dataset(tiny), 5).status == "infeasible"


# ---------------------------------------------------------------- exams
def test_impossible_exam_is_infeasible_not_a_crash(raw):
    r = copy.deepcopy(raw)
    r["exams"][0]["size"] = 10 ** 6
    res = solve_exams(load_dataset(r), 10)
    assert res.status == "infeasible" and res.exams == []


@pytest.mark.slow
@pytest.mark.parametrize("seed", range(3))
def test_random_exam_sets_are_valid(raw, V, seed):
    rnd = random.Random(seed)
    r = copy.deepcopy(raw)
    groups = [g["id"] for g in r["student_groups"]]
    for e in r["exams"]:
        e["groups"] = rnd.sample(groups, rnd.randint(1, 2))
        e["size"] = rnd.randint(40, 400)
    res = solve_exams(load_dataset(r), 30)
    assert res.status in ("optimal", "feasible")
    rep = V.run(r, {"dataset_id": r["dataset_id"], "sessions": [], "exams": res.exams})
    assert [v for v in rep["hard_violations"] if v["where"] == "exams"] == []
    assert rep["exam_soft_penalty"] == res.penalty


# ---------------------------------------------------------------- Spectra week
EVENT_TYPES = ["auditorium", "seminar_hall", "lecture_hall", "classroom", "outdoor", "lab_cs", "workshop"]


def random_requests(raw, seed):
    rnd = random.Random(seed)
    r = copy.deepcopy(raw)
    feats = sorted({f for x in raw["rooms"] for f in x["features"]}) + ["accessible"]
    groups = [g["id"] for g in raw["student_groups"]]
    rooms = [x["id"] for x in raw["rooms"]]
    cats = ["institute_event", "guest_lecture", "department_event", "club_event"]
    for b in r["booking_requests"]:
        b["role"] = rnd.choice(list(raw["role_category_cap"]))
        b["requested_category"] = rnd.choice(cats)
        b["submitted_at"] = f"2027-01-{rnd.randint(10, 30):02d}T{rnd.randint(0, 23):02d}:{rnd.choice(['00', '30'])}:00+05:30"
        b["duration_periods"] = rnd.randint(1, 4)
        b["attendance"] = rnd.choice([20, 45, 80, 120, 200, 450, 900])
        b["room_types"] = rnd.sample(EVENT_TYPES, rnd.randint(1, 3))
        b["needs"] = rnd.sample(feats, rnd.randint(0, 2))
        b["requested_room"] = rnd.choice([None, None, "NOPE"] + rooms)
        b["mandatory_for_groups"] = rnd.sample(groups, 1) if rnd.random() < 0.25 else []
        b["windows"] = []
        for _ in range(rnd.randint(1, 2)):
            a = rnd.randint(1, 13)
            b["windows"].append({"day": rnd.choice(raw["calendar"]["days"]), "from_period": a,
                                 "to_period": min(14, a + rnd.randint(0, 5))})
    r["cancellations"] = [{"request_id": rnd.choice(r["booking_requests"])["id"], "cancelled_at": "x", "by": "x"}] \
        if rnd.random() < 0.5 else []
    return r


@pytest.mark.slow
@pytest.mark.parametrize("seed", range(12))
def test_random_spectra_requests_valid_and_inversion_free(seed, V, base_assign):
    r = random_requests(json.loads(DATA.read_text()), seed)
    d = load_dataset(r)
    f = decide_fest(d, base_assign, time_limit_s=5)
    decisions = [asdict(x) for x in f.decisions]
    sched = {"dataset_id": d.dataset_id, "sessions": rows(base_assign),
             "fest_week": {"bookings": decisions, "session_overrides": f.overrides}}
    rep = V.run(r, sched)
    assert [v for v in rep["hard_violations"] if v["where"] != "exams"] == []
    assert rep["bookings"]["priority_inversions"] == []
    assert rep["warnings"] == []
    viol, warn, stats = check_fest(d, base_assign, decisions, f.overrides)
    assert viol == [] and warn == [] and stats == rep["bookings"]
    for c in d.cancelled:
        assert next(x for x in f.decisions if x.request_id == c).status == "rejected"


def test_failed_displacement_gives_up_after_a_few_solves(ds, base_assign, monkeypatch):
    crowded = dict(base_assign)
    for sid, s in ds.sessions.items():
        if "auditorium" in s["room_types"] and s["duration"] == 1 and not s.get("basket_slot"):
            if not check_move(ds, crowded, sid, "MON", 4, "AUD"):
                crowded[sid] = ("MON", 4, "AUD")
                break
    calls = []

    def never(*a, **k):
        calls.append(1)
        return SolveResult("infeasible", None, {}, 0, 0)

    monkeypatch.setattr(fest_mod, "solve_timetable", never)
    f = decide_fest(ds, crowded)
    br01 = next(x for x in f.decisions if x.request_id == "BR-01")
    assert br01.status != "approved" or br01.room_id != "AUD" or br01.start_period != 4
    assert len(calls) <= fest_mod.MAX_DISPLACE_ATTEMPTS * sum(
        1 for x in ds.requests.values() if x["requested_category"] == "institute_event")


def test_live_request_without_role_does_not_crash(ds, base_assign):
    extra = {**ds.requests["BR-07"], "id": "APP-0009", "requested_category": "institute_event"}
    extra.pop("role")
    f = decide_fest(ds, base_assign, extra_requests=[extra])
    assert any(x.request_id == "APP-0009" for x in f.decisions)


# ---------------------------------------------------------------- explanations
def test_explanations_agree_with_checker(ds, base_solve):
    assert base_solve.status == "optimal"
    assign = base_solve.assign
    rnd = random.Random(7)
    t0 = time.monotonic()
    sample = rnd.sample(sorted(assign), 12)
    for sid in sample:
        e = explain_session(ds, assign, sid)
        rooms_at = {}
        for d, p, rm in candidates(ds, ds.sessions[sid], relax=True):
            rooms_at.setdefault((d, p), []).append(rm)
        for a in e["alternatives"]:
            if a["blocked_by"]:
                assert all(check_move(ds, assign, sid, a["day"], a["start"], rm) for rm in rooms_at[(a["day"], a["start"])])
            else:
                assert check_move(ds, assign, sid, a["day"], a["start"], a["room"]) == []
                assert a["soft_delta"] >= 0          # base is optimal, so no single move can improve it
    per_call = (time.monotonic() - t0) / len(sample)
    assert per_call < 2.0, f"explain_session takes {per_call:.2f}s per call"


def institute_pressure(raw, base_assign, seed):
    """Institute events aimed at big rooms that hold classes during the day, so they must displace."""
    rnd = random.Random(seed)
    r = copy.deepcopy(raw)
    busy = [(d, p, rm) for (d, p, rm) in base_assign.values() if rm in ("AUD", "LH-1", "LH-2") and p <= 8]
    for b in rnd.sample(r["booking_requests"], 6):
        d, p, rm = rnd.choice(busy)
        b.update(role="admin", requested_category="institute_event", attendance=rnd.choice([120, 180]),
                 duration_periods=rnd.choice([1, 2]), room_types=["auditorium", "lecture_hall"], needs=[],
                 requested_room=rm, mandatory_for_groups=[],
                 windows=[{"day": d, "from_period": p, "to_period": min(9, p + 1)}])
    return r


@pytest.mark.slow
@pytest.mark.parametrize("seed", range(5))
def test_random_institute_displacements_are_valid(seed, V, base_assign):
    r = institute_pressure(json.loads(DATA.read_text()), base_assign, seed)
    d = load_dataset(r)
    f = decide_fest(d, base_assign, time_limit_s=10)
    sched = {"dataset_id": d.dataset_id, "sessions": rows(base_assign),
             "fest_week": {"bookings": [asdict(x) for x in f.decisions], "session_overrides": f.overrides}}
    rep = V.run(r, sched)
    assert [v for v in rep["hard_violations"] if v["where"] != "exams"] == []
    assert rep["bookings"]["priority_inversions"] == [] and rep["warnings"] == []
    for o in f.overrides:
        assert any(x.request_id == o["displaced_by"] and o["session_id"] in x.displaces for x in f.decisions)
    if seed == 0:
        assert f.overrides, "pressure set should force at least one displacement"
