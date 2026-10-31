"""Fix the timetable after a change, moving as few sessions as possible.

Approved Spectra bookings are held first. If the change can't be fixed while holding them, the
timetable wins (a permanent change beats a one-week booking) and the bookings are decided again.
Either way the Week-7 decisions are re-run on the new timetable, so the result always validates;
every booking whose decision changed is listed in `conflicts` with code "booking_changed".
"""
from dataclasses import asdict, dataclass, field
from typing import Literal

from ..core.checker import check_fest, soft_score
from ..core.model import Assign, Dataset
from .fest import Decision, FestResult, decide_fest
from .infeasible import Conflict, explain_infeasible, quick_conflicts
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
    fest: FestResult | None = None      # Week-7 decisions re-run on the new timetable
    proven_minimal: bool = False        # the solver proved no fix moves fewer sessions

    @property
    def overrides(self) -> list[dict]:
        return self.fest.overrides if self.fest else []


def commitments(ds: Dataset, fest, extra_requests=()) -> tuple[set, set]:
    """Cells held by placed Spectra bookings in the normal timetable: (room, day, p), plus (group, day, p)
    for groups a booking is mandatory for. Bookings that displaced classes are left out of the room
    cells: in the normal timetable those cells still belong to the displaced classes."""
    rooms, groups = set(), set()
    if fest is None:
        return rooms, groups
    reqs = {**ds.requests, **{r["id"]: r for r in extra_requests}}
    for d in fest.decisions:
        if d.status not in ("approved", "alternative_offered") or not d.room_id:
            continue
        for p in range(d.start_period, d.end_period + 1):
            if not d.displaces:
                rooms.add((d.room_id, d.day, p))
            for g in reqs.get(d.request_id, {}).get("mandatory_for_groups", []):
                groups.add((g, d.day, p))
    return rooms, groups


def _where(d: Decision) -> str:
    if d.status == "rejected":
        return "rejected"
    return f"{d.status.replace('_', ' ')} {d.room_id} {d.day} P{d.start_period}-P{d.end_period}"


def _booking_changes(old: FestResult, new: FestResult) -> list[Conflict]:
    before = {d.request_id: d for d in old.decisions}
    out = []
    for d in new.decisions:
        o = before.get(d.request_id)
        if o and (o.status, o.room_id, o.day, o.start_period) != (d.status, d.room_id, d.day, d.start_period):
            out.append(Conflict("booking_changed", f"{d.request_id}: was {_where(o)}, now {_where(d)} — {d.reason}"))
    return out


def repair(ds_after: Dataset, baseline: Assign, fest: FestResult | None, time_limit_s: float,
           extra_requests: list[dict] = ()) -> RepairResult:
    base = {s: v for s, v in baseline.items() if s in ds_after.sessions}
    soft_before = soft_score(ds_after, base)[1]
    quick = quick_conflicts(ds_after)
    if quick:
        return RepairResult("infeasible", None, soft_before=soft_before, conflicts=quick)
    rooms, groups = commitments(ds_after, fest, extra_requests)
    res = solve_timetable(ds_after, time_limit_s, baseline=base, move_weight=MOVE_WEIGHT,
                          blocked=rooms, blocked_groups=groups)
    released = False
    if res.assign is None and res.status == "infeasible" and (rooms or groups):
        released = True
        rooms, groups = set(), set()
        res = solve_timetable(ds_after, time_limit_s, baseline=base, move_weight=MOVE_WEIGHT)
    if res.assign is None:
        conflicts = explain_infeasible(ds_after, rooms, groups, time_limit_s)
        if res.status == "timeout" and all(c.code == "unknown" for c in conflicts):
            return RepairResult("timeout", None, soft_before=soft_before, conflicts=[
                Conflict("timeout", f"No fix found within {int(time_limit_s)}s; try again with a longer limit")])
        return RepairResult("infeasible", None, soft_before=soft_before, conflicts=conflicts)

    new = res.assign
    diff = [Move(s, tuple(baseline[s]) if s in baseline else None, tuple(new[s]) if s in new else None)
            for s in sorted(set(baseline) | set(new)) if tuple(baseline.get(s) or ()) != tuple(new.get(s) or ())]
    moved = [m for m in diff if m.before and m.after]
    conflicts, new_fest = [], None
    if fest is not None:
        new_fest = decide_fest(ds_after, new, extra_requests=list(extra_requests), time_limit_s=min(time_limit_s, 30))
        if released:
            conflicts.append(Conflict("booking_changed", "The change could not be fixed while keeping every approved "
                                                         "Spectra booking, so bookings were decided again"))
        conflicts += _booking_changes(fest, new_fest)
        viol, _, _ = check_fest(ds_after, new, [asdict(d) for d in new_fest.decisions], new_fest.overrides)
        if viol:   # never hand back something that fails the final check
            return RepairResult("infeasible", None, soft_before=soft_before, conflicts=[
                Conflict("booking", v.detail) for v in viol] + [
                Conflict("internal", "The re-decided Spectra bookings failed the final check; nothing was changed")])
    return RepairResult("ok", new, diff, len(moved),
                        sum(1 for m in moved if m.before[:2] != m.after[:2]),
                        sum(1 for m in moved if m.before[:2] == m.after[:2]),
                        soft_before, res.soft_total, conflicts, new_fest, res.status == "optimal")
