"""Name the constraints that make a timetable impossible.

Every hard-rule family (one faculty's unavailability, one room's closures, one group's no-clash rule,
fixed bookings, ...) gets an assumption literal. CP-SAT returns a small set of literals that cannot all
hold together; each one maps to a sentence.
"""
from collections import defaultdict
from dataclasses import dataclass

from ortools.sat.python import cp_model

from ..core.model import LAST_TEACHING, Dataset, block
from .model_builder import candidates


@dataclass
class Conflict:
    code: str
    text: str


def _cells_text(ds: Dataset, cells: set[tuple[str, int]]) -> str:
    order = {d: i for i, d in enumerate(ds.days)}
    by_day = defaultdict(list)
    for d, p in sorted(cells, key=lambda c: (order.get(c[0], 99), c[1])):
        by_day[d].append(p)
    return "; ".join(f"{d} P{min(ps)}–P{max(ps)}" if len(ps) > 1 else f"{d} P{ps[0]}" for d, ps in by_day.items())


def quick_conflicts(ds: Dataset, blocked_groups=frozenset()) -> list[Conflict]:
    """Counting arguments that prove a timetable impossible instantly and say why: a group or a
    faculty member needs more hours than the week (or their daily limit) can hold."""
    out = []
    periods = range(1, LAST_TEACHING + 1)
    need, basket_dur, basket_groups = defaultdict(int), defaultdict(int), defaultdict(set)
    for s in ds.sessions.values():
        if s.get("basket_slot"):
            basket_dur[s["basket_slot"]] = max(basket_dur[s["basket_slot"]], s["duration"])
            basket_groups[s["basket_slot"]].update(s["groups"])
        else:
            for g in s["groups"]:
                need[g] += s["duration"]
    for b, gs in basket_groups.items():
        for g in gs:
            need[g] += basket_dur[b]                 # electives in one basket share their periods
    for g, h in sorted(need.items()):
        free = sum(1 for d in ds.days for p in periods if (g, d, p) not in blocked_groups)
        if h > free:
            out.append(Conflict("group_clash", f"Group {g} needs {h} hours of classes a week, "
                                               f"but only {free} periods are free"))
    hours = defaultdict(int)
    for s in ds.sessions.values():
        hours[s["faculty_id"]] += s["duration"]
    for f, h in sorted(hours.items()):
        per_day = [sum(1 for p in periods if (d, p) not in ds.fac_un[f]) for d in ds.days]
        limit = ds.faculty[f].get("max_hours_per_day", 4)
        fits = sum(min(limit, x) for x in per_day)
        if h > sum(per_day):
            out.append(Conflict("fac_un", f"{_text(ds, 'fac_un', f)}; only {sum(per_day)} period(s) are left"))
        elif h > fits:
            if ds.fac_un[f]:
                out.append(Conflict("fac_un", _text(ds, "fac_un", f)))
            out.append(Conflict("daily", f"{_text(ds, 'daily', f)}, so at most {fits} of their {h} hours fit"))
    return out


def explain_infeasible(ds: Dataset, blocked=frozenset(), blocked_groups=frozenset(),
                       time_limit_s: float = 30) -> list[Conflict]:
    quick = quick_conflicts(ds, blocked_groups)
    if quick:
        return quick
    m = cp_model.CpModel()
    lits: dict[tuple[str, str], cp_model.IntVar] = {}

    def lit(kind: str, key: str):
        if (kind, key) not in lits:
            lits[(kind, key)] = m.NewBoolVar(f"{kind}:{key}")
        return lits[(kind, key)]

    room_cells, fac_cells, grp_cells = defaultdict(list), defaultdict(list), defaultdict(list)
    fac_day = defaultdict(list)
    basket_start = defaultdict(lambda: defaultdict(list))
    basket_cover = defaultdict(lambda: defaultdict(list))
    basket_groups = defaultdict(set)
    out: list[Conflict] = []

    for sid, s in ds.sessions.items():
        cands = candidates(ds, s, relax=True)
        if not cands:
            out.append(Conflict("session", f"{sid} has no room of type {'/'.join(s['room_types'])} "
                                           f"seating {s['size']} at any allowed time"))
            continue
        xs = {c: m.NewBoolVar("") for c in cands}
        m.AddExactlyOne(xs.values())
        f = s["faculty_id"]
        for (day, start, rid), v in xs.items():
            per = block(start, s["duration"])
            if any((day, p) in ds.fac_un[f] for p in per):
                m.Add(v == 0).OnlyEnforceIf(lit("fac_un", f))
            if any((day, p) in ds.room_un[rid] for p in per):
                m.Add(v == 0).OnlyEnforceIf(lit("room_un", rid))
            if any((rid, day, p) in blocked for p in per) or \
                    any((g, day, p) in blocked_groups for g in s["groups"] for p in per):
                m.Add(v == 0).OnlyEnforceIf(lit("booking", "all"))
            for p in per:
                room_cells[(rid, day, p)].append(v)
                fac_cells[(f, day, p)].append(v)
                if not s.get("basket_slot"):
                    for g in s["groups"]:
                        grp_cells[(g, day, p)].append(v)
            fac_day[(f, day)].append(s["duration"] * v)
            if s.get("basket_slot"):
                basket_start[s["basket_slot"]][(day, start)].append(v)
                for p in per:
                    basket_cover[s["basket_slot"]][(day, p)].append(v)
                basket_groups[s["basket_slot"]].update(s["groups"])
    if out:
        return out
    for b, cover in basket_cover.items():            # a basket occupies its groups once, as in the real model
        for (day, p), vs in cover.items():
            occ = m.NewBoolVar("")
            for v in vs:
                m.Add(occ >= v)
            m.Add(occ <= sum(vs))
            for g in basket_groups[b]:
                grp_cells[(g, day, p)].append(occ)

    for (rid, day, p), vs in room_cells.items():
        if len(vs) > 1:
            m.Add(sum(vs) <= 1).OnlyEnforceIf(lit("room_clash", rid))
    for (f, day, p), vs in fac_cells.items():
        if len(vs) > 1:
            m.Add(sum(vs) <= 1).OnlyEnforceIf(lit("fac_clash", f))
    for (g, day, p), vs in grp_cells.items():
        if len(vs) > 1:
            m.Add(sum(vs) <= 1).OnlyEnforceIf(lit("group_clash", g))
    for (f, day), terms in fac_day.items():
        m.Add(sum(terms) <= ds.faculty[f].get("max_hours_per_day", 4)).OnlyEnforceIf(lit("daily", f))
    for b, starts in basket_start.items():
        members = [s for s in ds.sessions.values() if s.get("basket_slot") == b]
        t = {k: m.NewBoolVar("") for k in starts}
        m.AddExactlyOne(t.values())
        for k, tv in t.items():
            m.Add(sum(starts[k]) == len(members) * tv).OnlyEnforceIf(lit("basket", b))

    m.AddAssumptions(list(lits.values()))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit_s)
    solver.parameters.num_workers = 1
    code = solver.Solve(m)
    if code != cp_model.INFEASIBLE:
        return [Conflict("unknown", "No valid timetable was found in the time limit, but the solver could not "
                                    "pin down a single cause. Try relaxing the newest change.")]
    by_index = {v.Index(): k for k, v in lits.items()}
    core = [by_index[i] for i in solver.SufficientAssumptionsForInfeasibility() if i in by_index]
    return [Conflict(kind, _text(ds, kind, key)) for kind, key in core]


def _text(ds: Dataset, kind: str, key: str) -> str:
    if kind == "fac_un":
        f = ds.faculty[key]
        hours = sum(s["duration"] for s in ds.sessions.values() if s["faculty_id"] == key)
        return f"{key} ({f.get('name', key)}) is unavailable {_cells_text(ds, ds.fac_un[key])}, but teaches {hours} hour(s) a week"
    if kind == "room_un":
        return f"{key} is closed {_cells_text(ds, ds.room_un[key])}"
    if kind == "booking":
        return "Approved Spectra-week bookings hold their rooms and their mandatory groups"
    if kind == "room_clash":
        return f"{key} can hold only one session at a time"
    if kind == "fac_clash":
        return f"{key} can teach only one session at a time"
    if kind == "group_clash":
        return f"Group {key} can attend only one session at a time"
    if kind == "daily":
        return f"{key} may teach at most {ds.faculty[key].get('max_hours_per_day', 4)} hours a day"
    if kind == "basket":
        return f"All {key} elective sessions must run at the same time"
    return f"{kind} {key}"
