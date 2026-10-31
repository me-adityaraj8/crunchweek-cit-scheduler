"""Engine benchmark. Run: .venv/bin/python backend/tests/engine/bench_engine.py
Not collected by pytest (no test_ prefix)."""
import json
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from backend.app.core.checker import check_move, full_report  # noqa: E402
from backend.app.core.dataset import apply_changes, load_dataset  # noqa: E402
from backend.app.core.explain import explain_session  # noqa: E402
from backend.app.core.export import build_schedule  # noqa: E402
from backend.app.solver.exams import solve_exams  # noqa: E402
from backend.app.solver.fest import decide_fest  # noqa: E402
from backend.app.solver.model_builder import build  # noqa: E402
from backend.app.solver.repair import repair  # noqa: E402
from backend.app.solver.timetable import solve_timetable  # noqa: E402

DATA = ROOT / "starter_pack" / "data" / "cit_public.json"
SAMPLE = json.loads((ROOT / "starter_pack" / "examples" / "sample_disruption.json").read_text())


def timed(fn, *a, **k):
    t0 = time.perf_counter()
    out = fn(*a, **k)
    return out, time.perf_counter() - t0


def main():
    ds, t = timed(load_dataset, DATA)
    print(f"load_dataset                      {t * 1000:8.0f} ms")
    tm, t = timed(build, ds)
    nvars = sum(len(v) for v in tm.x.values())
    print(f"build model ({nvars} placement vars)   {t * 1000:8.0f} ms")

    print("\nsolve_timetable (status, soft, wall time)")
    for workers in (1, 2, 4, 8):
        for limit in (10, 30, 60):
            r = solve_timetable(ds, limit, workers=workers)
            print(f"  workers={workers} limit={limit:>2}s   {r.status:9} soft={r.soft_total:<4} {r.solve_ms / 1000:6.1f}s")
    base = solve_timetable(ds, 60).assign

    ex, t = timed(solve_exams, ds, 30)
    print(f"\nsolve_exams                       {t:8.1f} s   status={ex.status} penalty={ex.penalty}")
    fest, t = timed(decide_fest, ds, base)
    print(f"decide_fest                       {t:8.1f} s   overrides={len(fest.overrides)}")
    sched = build_schedule(ds, base, fest, ex)
    _, t = timed(full_report, ds, sched)
    print(f"full_report                       {t * 1000:8.0f} ms")
    rr, t = timed(repair, apply_changes(ds, SAMPLE), base, fest, 60)
    print(f"repair (sample disruption)        {t:8.1f} s   moved={rr.moved} proven_minimal={rr.proven_minimal}")

    rnd = random.Random(1)
    sids = rnd.sample(sorted(base), 20)
    t0 = time.perf_counter()
    for sid in sids:
        explain_session(ds, base, sid)
    print(f"explain_session (avg of 20)       {(time.perf_counter() - t0) / 20 * 1000:8.0f} ms")
    t0 = time.perf_counter()
    for sid in sids:
        check_move(ds, base, sid, "MON", 1, "LH-1")
    print(f"check_move (avg of 20)            {(time.perf_counter() - t0) / 20 * 1000:8.1f} ms")


if __name__ == "__main__":
    main()
