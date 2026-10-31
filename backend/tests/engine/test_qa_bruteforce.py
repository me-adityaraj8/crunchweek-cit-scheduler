"""On tiny random instances, the CP-SAT optimum must equal an exhaustive search scored only by the
official validator (so a bug in our candidate filter or model can't hide behind our own checker)."""
import os
import random

import pytest

from backend.app.core.dataset import load_dataset
from backend.app.solver.timetable import solve_timetable
from backend.tests.engine.conftest import fac, grp, make_raw, room, sess


def tiny_instance(raw, seed):
    rnd = random.Random(seed)
    days = ["MON"] if seed % 3 else ["MON", "TUE"]
    rooms = [room("R1", "classroom", rnd.choice([40, 60, 120]), accessible=rnd.random() < 0.7),
             room("R2", "lecture_hall", rnd.choice([60, 150]))]
    if rnd.random() < 0.4:
        rooms.append(room("L1", "lab_cs", 60, uses=("lab", "event")))
    faculty = []
    for i in (1, 2):
        un = [{"day": rnd.choice(days), "periods": sorted(rnd.sample(range(1, 10), rnd.randint(1, 3))), "reason": "x"}] \
            if rnd.random() < 0.4 else []
        prefs = [{"type": "avoid", "days": [rnd.choice(days)], "periods": sorted(rnd.sample(range(1, 10), 2))}] \
            if rnd.random() < 0.6 else []
        faculty.append(fac(f"F{i}", max_h=rnd.choice([3, 4, 4]), unavailable=un, prefs=prefs))
    groups = [grp("G1", 30), grp("G2", 20)]
    sessions = []
    n = 3 if len(days) == 2 else 4
    for i in range(n):
        lab = any(r["type"] == "lab_cs" for r in rooms) and rnd.random() < 0.3
        g = rnd.choice([["G1"], ["G2"], ["G1", "G2"]])
        sessions.append(sess(f"S{i}", rnd.choice(["C1", "C2"]), kind="lab" if lab else rnd.choice(["lecture", "tutorial"]),
                             groups=g, faculty=rnd.choice(["F1", "F2"]),
                             size=sum(x["size"] for x in groups if x["id"] in g), duration=3 if lab else 1,
                             room_types=["lab_cs"] if lab else rnd.choice([["classroom"], ["classroom", "lecture_hall"]]),
                             accessible=rnd.random() < 0.08))
    if len(days) == 1 and rnd.random() < 0.5:
        sessions += [sess("Ba", "E1", groups=["G1", "G2"], faculty="F1", size=20, basket="OE",
                          room_types=["classroom", "lecture_hall"]),
                     sess("Bb", "E2", groups=["G1", "G2"], faculty="F2", size=20, basket="OE",
                          room_types=["classroom", "lecture_hall"])]
    return make_raw(raw, rooms, faculty, groups, sessions, days=days)


def brute_force(V, tiny):
    """Exhaustive search over every (day, start, room), pruned only by the validator's own hard check."""
    ctx = V.Ctx(tiny)
    sids = [s["id"] for s in tiny["sessions"]]
    options = [(d, p, r["id"]) for d in tiny["calendar"]["days"] for p in range(1, 10) for r in tiny["rooms"]]
    best = [None]

    def ok(partial):
        viol, _ = V.check_timetable(ctx, partial, "bf")
        return not [v for v in viol if not (v["rule"] == "H1" and "is not scheduled" in v["detail"])]

    def go(i, partial):
        if i == len(sids):
            soft = V.soft_score(ctx, partial)[1]
            if best[0] is None or soft < best[0]:
                best[0] = soft
            return
        for o in options:
            partial[sids[i]] = o
            if ok(partial):
                go(i + 1, partial)
            del partial[sids[i]]

    go(0, {})
    return best[0]


@pytest.mark.slow
@pytest.mark.parametrize("seed", range(int(os.environ.get("QA_BRUTE_SEEDS", 24))))
def test_solver_optimum_equals_exhaustive_search(seed, raw, V):
    tiny = tiny_instance(raw, seed)
    expected = brute_force(V, tiny)
    r = solve_timetable(load_dataset(tiny), 20, workers=4)
    if expected is None:
        assert r.status == "infeasible", (r.status, r.soft_total)
    else:
        assert r.status == "optimal", r.status
        assert r.soft_total == expected
        viol, _ = V.check_timetable(V.Ctx(tiny), r.assign, "t")
        assert viol == []
