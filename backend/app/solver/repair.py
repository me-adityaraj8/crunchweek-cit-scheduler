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
    overrides: list[dict] = field(default_factory=list)   # Week-7 overrides rebuilt for the new timetable


def commitments(ds: Dataset, fest, include_displacing: bool = True) -> tuple[set, set]:
    """Cells that placed Spectra bookings hold: (room, day, p) and (group, day, p) for mandatory groups.
    Bookings that displaced classes are left out of the room cells when include_displacing is False:
    in the normal timetable those cells still belong to the displaced classes."""
    rooms, groups = set(), set()
    if fest is None:
        return rooms, groups
    for d in fest.decisions:
        if d.status not in ("approved", "alternative_offered") or not d.room_id:
            continue
        for p in range(d.start_period, d.end_period + 1):
            if include_displacing or not d.displaces:
                rooms.add((d.room_id, d.day, p))
            for g in ds.requests.get(d.request_id, {}).get("mandatory_for_groups", []):
                groups.add((g, d.day, p))
    return rooms, groups


def _week7(ds: Dataset, assign: Assign, fest, time_limit_s: float) -> tuple[list[dict], list[Conflict]]:
    """Re-place, for Week 7 only, the classes that sit under bookings which displace classes."""
    displacing = [d for d in fest.decisions if d.displaces and d.status == "approved"]
    if not displacing:
        return [], []
    rooms, groups = commitments(ds, fest, include_displacing=True)
    res = solve_timetable(ds, time_limit_s, baseline=assign, move_weight=MOVE_WEIGHT,
                          blocked=rooms, blocked_groups=groups)
    if res.assign is None:
        return [], [Conflict("booking", "Week 7: classes displaced by institute events cannot be re-placed "
                                        f"({', '.join(d.request_id for d in displacing)})")]
    by_cell = {(d.room_id, d.day, p): d.request_id for d in displacing for p in range(d.start_period, d.end_period + 1)}
    old = {o["session_id"]: o["displaced_by"] for o in fest.overrides}
    out = []
    for sid, v in sorted(res.assign.items()):
        if tuple(v) == tuple(assign[sid]):
            continue
        day, start, room = assign[sid]
        cause = next((by_cell[(room, day, p)] for p in block(start, ds.sessions[sid]["duration"])
                      if (room, day, p) in by_cell), old.get(sid, displacing[0].request_id))
        out.append({"session_id": sid, "day": v[0], "start_period": v[1], "room_id": v[2], "displaced_by": cause})
    return out, []


def repair(ds_after: Dataset, baseline: Assign, fest, time_limit_s: float) -> RepairResult:
    base = {s: v for s, v in baseline.items() if s in ds_after.sessions}
    soft_before = soft_score(ds_after, base)[1]
    rooms, groups = commitments(ds_after, fest, include_displacing=False)
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
    conflicts, overrides = [], []
    if fest is not None:
        overrides, conflicts = _week7(ds_after, new, fest, time_limit_s)
        viol, _, _ = check_fest(ds_after, new, [asdict(d) for d in fest.decisions], overrides)
        conflicts += [Conflict("booking", v.detail) for v in viol]
    return RepairResult("ok", new, diff, len(moved),
                        sum(1 for m in moved if m.before[:2] != m.after[:2]),
                        sum(1 for m in moved if m.before[:2] == m.after[:2]),
                        soft_before, res.soft_total, conflicts, overrides)
