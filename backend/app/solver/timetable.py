import time
from dataclasses import dataclass
from typing import Literal

from ortools.sat.python import cp_model

from ..core.checker import soft_score
from ..core.model import Assign, Dataset
from .model_builder import build, candidates  # noqa: F401  (candidates is part of this module's API)


@dataclass
class SolveResult:
    status: Literal["optimal", "feasible", "infeasible", "timeout"]
    assign: Assign | None
    soft: dict[str, int]
    soft_total: int
    solve_ms: int


def run_model(tm, time_limit_s: float, workers: int, objective) -> tuple[str, cp_model.CpSolver]:
    tm.model.Minimize(objective)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit_s)
    solver.parameters.num_workers = workers
    code = solver.Solve(tm.model)
    status = {cp_model.OPTIMAL: "optimal", cp_model.FEASIBLE: "feasible",
              cp_model.INFEASIBLE: "infeasible"}.get(code, "timeout")
    return status, solver


def read_assign(tm, solver) -> Assign:
    return {sid: c for sid, cs in tm.x.items() for c, v in cs.items() if solver.BooleanValue(v)}


def solve_timetable(ds: Dataset, time_limit_s: float, baseline: Assign | None = None, move_weight: int = 0,
                    blocked: set[tuple[str, str, int]] = frozenset(), workers: int = 8,
                    blocked_groups: set[tuple[str, str, int]] = frozenset()) -> SolveResult:
    """Place every session. With move_weight > 0, each session that leaves its baseline slot costs
    move_weight (on top of the soft penalty). `blocked` holds (room, day, period) cells already taken;
    `blocked_groups` holds (group, day, period) cells where a group must stay free."""
    t0 = time.monotonic()
    tm = build(ds, blocked=frozenset(blocked), baseline=baseline, move_weight=move_weight,
               blocked_groups=frozenset(blocked_groups))
    if tm.empty:
        return SolveResult("infeasible", None, {}, 0, int((time.monotonic() - t0) * 1000))
    status, solver = run_model(tm, time_limit_s, workers, sum(tm.soft_terms) + sum(tm.move_terms))
    ms = int((time.monotonic() - t0) * 1000)
    if status not in ("optimal", "feasible"):
        return SolveResult(status, None, {}, 0, ms)
    assign = read_assign(tm, solver)
    soft, total = soft_score(ds, assign)
    return SolveResult(status, assign, soft, total, ms)
