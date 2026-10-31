import time
from collections import defaultdict
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from ..core.checker import check_exams
from ..core.model import Dataset

SAME_DAY_PENALTY = 5


@dataclass
class ExamResult:
    status: str
    exams: list[dict] = field(default_factory=list)
    penalty: int = 0
    solve_ms: int = 0


def solve_exams(ds: Dataset, time_limit_s: float = 30, workers: int = 8) -> ExamResult:
    """Give every exam one (day, AM/PM) slot and enough rooms at half capacity."""
    t0 = time.monotonic()
    cal = ds.calendar["exam_week"]
    slots = [(d, s["id"]) for d in cal["days"] for s in cal["sessions"]]
    rooms = [r for r in ds.rooms.values() if "exam" in r["allowed_uses"]]
    m = cp_model.CpModel()

    y = {(e["id"], k): m.NewBoolVar("") for e in ds.exams for k in slots}
    z = {}
    for e in ds.exams:
        m.AddExactlyOne(y[(e["id"], k)] for k in slots)
        for k in slots:
            for r in rooms:
                v = m.NewBoolVar("")
                m.AddImplication(v, y[(e["id"], k)])
                z[(e["id"], r["id"], k)] = v
            m.Add(sum((r["capacity"] // 2) * z[(e["id"], r["id"], k)] for r in rooms) >= e["size"] * y[(e["id"], k)])

    for k in slots:
        for r in rooms:
            m.Add(sum(z[(e["id"], r["id"], k)] for e in ds.exams) <= 1)

    by_group = defaultdict(list)
    for e in ds.exams:
        for g in e["groups"]:
            by_group[g].append(e["id"])
    penalty_terms = []
    for g, eids in by_group.items():
        for k in slots:
            m.Add(sum(y[(eid, k)] for eid in eids) <= 1)
        for d in cal["days"]:
            day_slots = [k for k in slots if k[0] == d]
            extra = m.NewIntVar(0, len(day_slots), "")
            m.Add(extra >= sum(y[(eid, k)] for eid in eids for k in day_slots) - 1)
            penalty_terms.append(SAME_DAY_PENALTY * extra)

    # same-day penalty dominates; fewer rooms per exam is the tie-break
    m.Minimize(1000 * sum(penalty_terms) + sum(z.values()))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit_s)
    solver.parameters.num_workers = workers
    code = solver.Solve(m)
    ms = int((time.monotonic() - t0) * 1000)
    if code not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return ExamResult("infeasible" if code == cp_model.INFEASIBLE else "timeout", solve_ms=ms)

    out = []
    for e in ds.exams:
        k = next(k for k in slots if solver.BooleanValue(y[(e["id"], k)]))
        used = [r["id"] for r in rooms if solver.BooleanValue(z[(e["id"], r["id"], k)])]
        out.append({"exam_id": e["id"], "day": k[0], "session": k[1], "rooms": used})
    _, pen = check_exams(ds, out)
    return ExamResult("optimal" if code == cp_model.OPTIMAL else "feasible", out, pen, ms)
