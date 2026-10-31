"""Fix the timetable after a change, moving as few sessions as possible."""
from dataclasses import asdict, dataclass, field
from typing import Literal

from ..core.checker import check_fest, soft_score
from ..core.model import Assign, Dataset, block
from .infeasible import Conflict, explain_infeasible
from .timetable import solve_timetable

MOVE_WEIGHT = 1000


@dataclass
class Move:
    session_id: str
    before: tuple | None
    after: tuple | None


@dataclass
class RepairResult:
    status: Literal["ok", "infeasible", "timeout"]
    assign: Assign | None
    diff: list[Move] = field(default_factory=list)
    moved: int = 0
    time_changed: int = 0
    room_only: int = 0
    soft_before: int = 0
    soft_after: int = 0
    conflicts: list[Conflict] = field(default_factory=list)


def commitments(ds: Dataset, fest) -> tuple[set, set]:
    """Cells that approved Spectra bookings and Week-7 overrides hold: (room, day, p) and (group, day, p)."""
    rooms, groups = set(), set()
    if fest is None:
        return rooms, groups
    reqs = {**ds.requests}
    for d in fest.decisions:
        if d.status in ("approved", "alternative_offered") and d.room_id:
            for p in range(d.start_period, d.end_period + 1):
                rooms.add((d.room_id, d.day, p))
                for g in reqs.get(d.request_id, {}).get("mandatory_for_groups", []):
                    groups.add((g, d.day, p))
    for o in fest.overrides:
        s = ds.sessions.get(o["session_id"])
        if s:
            for p in block(o["start_period"], s["duration"]):
                rooms.add((o["room_id"], o["day"], p))
    return rooms, groups


def repair(ds_after: Dataset, baseline: Assign, fest, time_limit_s: float) -> RepairResult:
    base = {s: v for s, v in baseline.items() if s in ds_after.sessions}
    soft_before = soft_score(ds_after, base)[1]
    rooms, groups = commitments(ds_after, fest)
    res = solve_timetable(ds_after, time_limit_s, baseline=base, move_weight=MOVE_WEIGHT,
                          blocked=rooms, blocked_groups=groups)
    if res.assign is None:
        if res.status == "timeout":
            return RepairResult("timeout", None, soft_before=soft_before, conflicts=[
                Conflict("timeout", f"No fix found within {int(time_limit_s)}s; try again with a longer limit")])
        return RepairResult("infeasible", None, soft_before=soft_before,
                            conflicts=explain_infeasible(ds_after, rooms, groups, time_limit_s))

    new = res.assign
    diff = [Move(s, tuple(baseline[s]) if s in baseline else None, tuple(new[s]) if s in new else None)
            for s in sorted(set(baseline) | set(new)) if tuple(baseline.get(s) or ()) != tuple(new.get(s) or ())]
    moved = [m for m in diff if m.before and m.after]
    conflicts = []
    if fest is not None:
        viol, _, _ = check_fest(ds_after, new, [asdict(d) for d in fest.decisions], fest.overrides)
        conflicts = [Conflict("booking", v.detail) for v in viol]
    return RepairResult("ok", new, diff, len(moved),
                        sum(1 for m in moved if m.before[:2] != m.after[:2]),
                        sum(1 for m in moved if m.before[:2] == m.after[:2]),
                        soft_before, res.soft_total, conflicts)
