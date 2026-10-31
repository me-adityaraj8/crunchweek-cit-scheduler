"""Rule-by-rule and fuzz parity between core/checker.py and the official validator."""
import copy
import random

import pytest

from backend.app.core.checker import check_timetable, full_report, soft_score
from backend.app.core.dataset import apply_changes, load_dataset
from backend.app.core.export import build_schedule
from backend.tests.engine.conftest import DATA, assert_same_report, fac, grp, make_raw, room, sess

REQUIRED_RULES = {"H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10", "H11", "H12", "H13", "H14",
                  "B1", "B2", "B3", "E1", "E2"}


@pytest.fixture(scope="module")
def ds():
    return load_dataset(DATA)


@pytest.fixture(scope="module")
def valid(ds, base_assign, base_fest, base_exams):
    return build_schedule(ds, base_assign, base_fest, base_exams, team="qa")


@pytest.fixture(scope="module")
def fixed_raw(raw, base_assign):
    """Public data with fixed slots on six sessions (at their solved positions), so H14 can be exercised."""
    r = copy.deepcopy(raw)
    picked = [s for s in r["sessions"] if not s.get("basket_slot")][:6]
    for s in picked:
        d, p, _ = base_assign[s["id"]]
        s["fixed_slot"] = {"day": d, "start_period": p}
    return r


def _put(sched, sid, **kw):
    s = copy.deepcopy(sched)
    for row in s["sessions"]:
        if row["session_id"] == sid:
            row.update(kw)
    return s


def _row(sched, sid):
    return next(r for r in sched["sessions"] if r["session_id"] == sid)


def _one_hour(ds, pred=lambda s: True):
    return [s for s in ds.sessions.values() if s["duration"] == 1 and not s.get("basket_slot") and pred(s)]


# ---------------------------------------------------------------- one perturbation per rule
def case_h1_missing(ds, v):
    s = copy.deepcopy(v); s["sessions"].pop(); return s


def case_h1_duplicate(ds, v):
    s = copy.deepcopy(v); s["sessions"].append(dict(s["sessions"][0])); return s


def case_h1_unknown_ids(ds, v):
    s = copy.deepcopy(v)
    s["sessions"].append({"session_id": "NOPE", "day": "MON", "start_period": 1, "room_id": "LH-1"})
    s["sessions"][0]["room_id"] = "NOPE"
    s["sessions"][1]["day"] = "SAT"
    return s


def case_h2(ds, v):
    for a in _one_hour(ds):
        for b in _one_hour(ds, lambda s: s["faculty_id"] == a["faculty_id"] and s["id"] != a["id"]
                           and not set(s["groups"]) & set(a["groups"])):
            ra = _row(v, a["id"])
            return _put(v, b["id"], day=ra["day"], start_period=ra["start_period"])


def case_h3(ds, v):
    for a in _one_hour(ds):
        for b in _one_hour(ds, lambda s: set(s["groups"]) & set(a["groups"]) and s["faculty_id"] != a["faculty_id"]):
            ra = _row(v, a["id"])
            return _put(v, b["id"], day=ra["day"], start_period=ra["start_period"])


def case_h4(ds, v):
    a, b = _one_hour(ds)[:2]
    ra = _row(v, a["id"])
    return _put(v, b["id"], day=ra["day"], start_period=ra["start_period"], room_id=ra["room_id"])


def case_h5(ds, v):
    for s in _one_hour(ds):
        small = [r for r in ds.rooms.values() if r["type"] in s["room_types"] and r["capacity"] < s["size"]]
        if small:
            return _put(v, s["id"], room_id=small[0]["id"])


def case_h6(ds, v):
    lab = next(s for s in ds.sessions.values() if s["kind"] == "lab")
    return _put(v, lab["id"], room_id="LH-1")


def case_h7(ds, v):
    for s in _one_hour(ds):
        un = sorted(ds.fac_un[s["faculty_id"]])
        if un:
            d, p = un[0]
            return _put(v, s["id"], day=d, start_period=p)


def case_h8(ds, v):
    u = ds.raw["room_unavailability"][0]
    r = ds.rooms[u["room_id"]]
    s = _one_hour(ds, lambda s: r["type"] in s["room_types"] and s["size"] <= r["capacity"])[0]
    return _put(v, s["id"], day=u["day"], start_period=u["periods"][0], room_id=r["id"])


def case_h9(ds, v):
    labs = [s for s in ds.sessions.values() if s["kind"] == "lab"]
    s = _put(v, labs[0]["id"], start_period=3)          # lab start
    s = _put(s, labs[1]["id"], start_period=4)          # crosses lunch
    return _put(s, labs[2]["id"], start_period=8)       # runs past P9


def case_h10(ds, v):
    s = next(x for x in ds.sessions.values() if x.get("needs_accessible") and x["duration"] == 1)
    bad = next(r for r in ds.rooms.values() if not r["accessible"])
    return _put(v, s["id"], room_id=bad["id"])


def case_h11(ds, v):
    s = next(x for x in ds.sessions.values() if x.get("basket_slot"))
    r = _row(v, s["id"])
    return _put(v, s["id"], start_period=1 if r["start_period"] != 1 else 2)


def case_h12(ds, v):
    by_fac = {}
    for s in _one_hour(ds):
        by_fac.setdefault(s["faculty_id"], []).append(s["id"])
    f, sids = next((f, x) for f, x in by_fac.items() if len(x) >= 5)
    s = copy.deepcopy(v)
    for p, sid in enumerate(sids[:5], start=1):
        s = _put(s, sid, day="MON", start_period=p)
    return s


def _decision(v, rid):
    return next(b for b in v["fest_week"]["bookings"] if b["request_id"] == rid)


def case_fest_rules(ds, v):
    s = copy.deepcopy(v)
    b = s["fest_week"]["bookings"]
    b.append(dict(b[0]))                                                      # B1 duplicate
    cancelled = next(x for x in b if x["request_id"] == "BR-04")
    cancelled.update(status="approved", day="TUE", start_period=10, end_period=12, room_id="SH-1")  # B3
    approved = [x for x in b if x["status"] == "approved"]
    approved[1]["status"] = "maybe"                                           # B1 unknown status
    big = next(x for x in b if x["request_id"] == "BR-01")
    big["room_id"] = "LH-1"                                                   # H13 seats
    s["fest_week"]["session_overrides"] = [
        {"session_id": "NOPE", "day": "MON", "start_period": 1, "room_id": "LH-1", "displaced_by": "BR-01"},
        {"session_id": s["sessions"][0]["session_id"], "day": "TUE", "start_period": 1, "room_id": "LH-1",
         "displaced_by": "BR-07"},                                            # club cannot displace (B2)
        {"session_id": s["sessions"][1]["session_id"], "day": "TUE", "start_period": 2, "room_id": "LH-2",
         "displaced_by": "BR-09"},                                            # not approved (B2)
    ]
    return s


def case_fest_reason_and_window(ds, v):
    s = copy.deepcopy(v)
    for x in s["fest_week"]["bookings"]:
        if x["status"] == "rejected":
            x["reason"] = ""                                                  # warning
        elif x["status"] == "approved" and x["request_id"] == "BR-06":
            x["day"] = "MON"                                                  # H13 outside window
    return s


def case_exam_rules(ds, v):
    s = copy.deepcopy(v)
    ex = s["exams"]
    ex.append(dict(ex[0]))                                                    # E1 twice
    ex.append({"exam_id": "EX-NOPE", "day": "MON", "session": "AM", "rooms": ["AUD"]})   # E1 unknown
    ex[1] = {**ex[1], "day": "SUN"}                                           # E1 invalid slot
    ex[2] = {**ex[2], "rooms": ["OAT", "CS-LAB-1"]}                           # E2 + H5 seats
    ex[3] = {**ex[3], "day": ex[4]["day"], "session": ex[4]["session"], "rooms": ex[4]["rooms"]}  # H4 (+H3 maybe)
    ex.pop(5)                                                                 # E1 not scheduled
    return s


CASES = {
    "H1-missing": (case_h1_missing, "H1"), "H1-duplicate": (case_h1_duplicate, "H1"),
    "H1-unknown": (case_h1_unknown_ids, "H1"), "H2": (case_h2, "H2"), "H3": (case_h3, "H3"),
    "H4": (case_h4, "H4"), "H5": (case_h5, "H5"), "H6": (case_h6, "H6"), "H7": (case_h7, "H7"),
    "H8": (case_h8, "H8"), "H9": (case_h9, "H9"), "H10": (case_h10, "H10"), "H11": (case_h11, "H11"),
    "H12": (case_h12, "H12"), "fest": (case_fest_rules, "B1"), "fest-window": (case_fest_reason_and_window, "H13"),
    "exams": (case_exam_rules, "E1"),
}


@pytest.mark.parametrize("name", sorted(CASES))
def test_each_rule_matches_validator(name, ds, raw, V, valid):
    fn, rule = CASES[name]
    sched = fn(ds, valid)
    assert sched is not None, f"{name}: no suitable sessions in the data"
    ours, theirs = full_report(ds, sched), V.run(raw, sched)
    assert rule in ours["hard_by_rule"], ours["hard_by_rule"]
    assert_same_report(ours, theirs)


def test_targeted_cases_cover_every_rule(ds, raw, V, valid, fixed_raw):
    seen = set()
    for fn, _ in CASES.values():
        seen |= set(V.run(raw, fn(ds, valid))["hard_by_rule"])
    ds_fixed = load_dataset(fixed_raw)
    sid = next(s["id"] for s in fixed_raw["sessions"] if s.get("fixed_slot"))
    r = _row(valid, sid)
    moved = _put(valid, sid, start_period=r["start_period"] % 9 + 1)
    rep = V.run(fixed_raw, moved)
    assert_same_report(full_report(ds_fixed, moved), rep)
    seen |= set(rep["hard_by_rule"])
    assert REQUIRED_RULES <= seen, REQUIRED_RULES - seen
    assert "H14" in rep["hard_by_rule"]


def test_valid_schedule_is_clean_in_both(ds, raw, V, valid):
    ours, theirs = full_report(ds, valid), V.run(raw, valid)
    assert_same_report(ours, theirs)
    assert ours["hard_violation_count"] == 0 and ours["warnings"] == []


# ---------------------------------------------------------------- fuzz near-valid schedules
def mutate(ds, sched, seed, k=None):
    rnd = random.Random(seed)
    s = copy.deepcopy(sched)
    rooms, rows = list(ds.rooms), s["sessions"]
    bookings = s["fest_week"]["bookings"]
    req_ids = list(ds.requests) + ["NOPE"]
    for _ in range(k or rnd.randint(1, 8)):
        op = rnd.random()
        r = rnd.choice(rows)
        if op < 0.30:
            r.update(day=rnd.choice(ds.days), start_period=rnd.randint(1, 9))
        elif op < 0.45:
            r["room_id"] = rnd.choice(rooms)
        elif op < 0.55:
            q = rnd.choice(rows)
            for key in ("day", "start_period", "room_id"):
                r[key], q[key] = q[key], r[key]
        elif op < 0.60:
            rows.remove(r)
        elif op < 0.63:
            rows.append(dict(r))
        elif op < 0.66:
            r[rnd.choice(["day", "start_period"])] = rnd.choice(["SAT", None, 0, 10, "3", 2.0])
        elif op < 0.80:
            cancelled = [x for x in bookings if x["request_id"] in ds.cancelled]
            b = rnd.choice(cancelled) if cancelled and rnd.random() < 0.15 else rnd.choice(bookings)
            what = rnd.random()
            if what < 0.3:
                b["status"] = rnd.choice(["approved", "alternative_offered", "rejected", "pending"])
                b.setdefault("day", "THU"); b.setdefault("start_period", 10); b.setdefault("end_period", 11)
                b.setdefault("room_id", rnd.choice(rooms))
            elif what < 0.6 and "start_period" in b:
                shift = rnd.randint(-3, 3)
                b["start_period"] += shift; b["end_period"] += shift
            elif what < 0.8 and "room_id" in b:
                b["room_id"] = rnd.choice(rooms + ["NOPE"])
            else:
                b["reason"] = rnd.choice(["", "   ", "full"])
        elif op < 0.87:
            s["fest_week"]["session_overrides"].append(
                {"session_id": rnd.choice(rows)["session_id"], "day": rnd.choice(ds.days),
                 "start_period": rnd.randint(1, 9), "room_id": rnd.choice(rooms), "displaced_by": rnd.choice(req_ids)})
        else:
            e = rnd.choice(s["exams"])
            what = rnd.random()
            if what < 0.4:
                e.update(day=rnd.choice(["MON", "TUE", "SAT", "SUN"]), session=rnd.choice(["AM", "PM", "EVE"]))
            elif what < 0.7:
                e["rooms"] = rnd.sample(rooms, rnd.randint(0, 3))
            elif what < 0.85:
                s["exams"].remove(e)
            else:
                s["exams"].append(dict(e))
    return s


def _compare(ds, raw, V, sched, baseline=None):
    """Parity with the validator. Where the validator itself crashes (a start period that isn't an
    int), ours must still answer and flag it as H9."""
    try:
        theirs = V.run(raw, sched, baseline)
    except TypeError:
        ours = full_report(ds, sched, baseline)
        assert "H9" in ours["hard_by_rule"]
        return
    assert_same_report(full_report(ds, sched, baseline), theirs)


def test_garbage_start_period_is_reported_not_crashed(ds, valid):
    for bad in ("3", None, 2.0):
        sched = _put(valid, valid["sessions"][0]["session_id"], start_period=bad)
        sched["fest_week"]["session_overrides"].append(
            {"session_id": valid["sessions"][1]["session_id"], "day": "MON", "start_period": bad,
             "room_id": "LH-1", "displaced_by": "BR-01"})
        rep = full_report(ds, sched)
        assert "H9" in rep["hard_by_rule"]
        assert soft_score(ds, {valid["sessions"][0]["session_id"]: ("MON", bad, "LH-1")})[1] == 0


@pytest.mark.parametrize("seed", range(150))
def test_fuzz_near_valid_matches_validator(seed, ds, raw, V, valid):
    _compare(ds, raw, V, mutate(ds, valid, seed))


@pytest.mark.parametrize("seed", range(40))
def test_fuzz_with_fixed_slots_matches_validator(seed, raw, V, valid, fixed_raw):
    ds_fixed = load_dataset(fixed_raw)
    _compare(ds_fixed, fixed_raw, V, mutate(ds_fixed, valid, 1000 + seed))


@pytest.mark.parametrize("seed", range(40))
def test_fuzz_after_disruption_with_baseline(seed, ds, raw, V, valid, sample_disruption):
    ds2 = apply_changes(ds, sample_disruption)
    raw2 = V.apply_disruption(raw, sample_disruption)
    after = mutate(ds2, valid, 2000 + seed)
    if seed % 2:
        after.pop("exams")
    _compare(ds2, raw2, V, after, valid)


def test_fuzz_corpus_exercises_every_rule_and_soft_term(ds, raw, V, valid, fixed_raw):
    rules, soft = set(), set()
    ds_fixed = load_dataset(fixed_raw)
    for seed in range(150):
        rep = full_report(ds, mutate(ds, valid, seed))      # parity proven above; ours never crashes
        rules |= set(rep["hard_by_rule"])
        soft |= {k for k, x in rep["soft_penalties"].items() if x}
    for seed in range(40):
        rules |= set(full_report(ds_fixed, mutate(ds_fixed, valid, 1000 + seed))["hard_by_rule"])
    assert REQUIRED_RULES <= rules, REQUIRED_RULES - rules
    assert {"S1", "S2", "S3", "S4", "S5", "S6"} <= soft, soft


# ---------------------------------------------------------------- soft terms against hand-worked numbers
def test_soft_terms_known_answer(raw, V):
    tiny = make_raw(raw,
                    rooms=[room("R1", cap=100), room("R2", cap=60), room("R3", cap=60)],
                    faculty=[fac("F1", prefs=[{"type": "avoid", "days": ["MON"], "periods": [1]}]), fac("F2"), fac("F3")],
                    groups=[grp("G1", 50), grp("G2", 50)],
                    sessions=[sess("A", "C1", faculty="F1"), sess("B", "C1", faculty="F2"),
                              sess("C", "C2", faculty="F2", size=20)]
                    + [sess(f"D{i}", f"K{i}", groups=["G2"], faculty="F3") for i in range(1, 8)])
    assign = {"A": ("MON", 1, "R1"), "B": ("MON", 3, "R2"), "C": ("MON", 9, "R1")}
    assign.update({f"D{i}": ("MON", i, "R3") for i in range(1, 8)})
    ds = load_dataset(tiny)
    expected = {"S1": 2, "S2": 6, "S3": 3, "S4": 3, "S5": 1, "S6": 1}
    assert check_timetable(ds, assign) == [] and V.check_timetable(V.Ctx(tiny), assign, "t")[0] == []
    assert soft_score(ds, assign) == (expected, 16)
    assert V.soft_score(V.Ctx(tiny), assign) == (expected, 16)


def test_basket_soft_terms_known_answer(raw, V):
    tiny = make_raw(raw, rooms=[room("R1", cap=100), room("R2", cap=60)],
                    faculty=[fac("F4"), fac("F5")], groups=[grp("G3", 50)],
                    sessions=[sess("E1a", "C10", groups=["G3"], faculty="F4", basket="B1"),
                              sess("E1b", "C11", groups=["G3"], faculty="F5", basket="B1"),
                              sess("E2", "C10", groups=["G3"], faculty="F4", basket="B2")])
    assign = {"E1a": ("MON", 5, "R1"), "E1b": ("MON", 5, "R2"), "E2": ("MON", 6, "R1")}
    ds = load_dataset(tiny)
    expected = ({"S1": 0, "S2": 0, "S3": 0, "S4": 3, "S5": 0, "S6": 0}, 3)
    assert check_timetable(ds, assign) == []        # same basket at the same time is not a group clash
    assert soft_score(ds, assign) == expected == V.soft_score(V.Ctx(tiny), assign)
