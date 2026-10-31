"""CP-SAT model for the weekly timetable. Shared by the first solve, Week-7 overrides and repair."""
from collections import defaultdict
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from ..core.model import LAST_TEACHING, Assign, Dataset, block

KIND_USE = {"lecture": "lecture", "tutorial": "tutorial", "lab": "lab"}


def candidates(ds: Dataset, s: dict, blocked: frozenset | set = frozenset()) -> list[tuple[str, int, str]]:
    """Every (day, start, room) that passes the single-session hard rules."""
    dur = s["duration"]
    fx = s.get("fixed_slot")
    use = KIND_USE.get(s["kind"], s["kind"])
    rooms = [r for r in ds.rooms.values()
             if r["type"] in s["room_types"] and r["capacity"] >= s["size"]
             and (r["accessible"] or not s.get("needs_accessible"))
             and use in r.get("allowed_uses", [use])]
    out = []
    for day in ds.days:
        for start in range(1, LAST_TEACHING - dur + 2):
            per = block(start, dur)
            if per[0] <= ds.lunch_after < per[-1]:
                continue
            if s["kind"] == "lab" and start not in ds.lab_starts:
                continue
            if fx and (fx["day"] != day or fx["start_period"] != start):
                continue
            if any((day, p) in ds.fac_un[s["faculty_id"]] for p in per):
                continue
            for r in rooms:
                if any((day, p) in ds.room_un[r["id"]] or (r["id"], day, p) in blocked for p in per):
                    continue
                out.append((day, start, r["id"]))
    return out


@dataclass
class TimetableModel:
    model: cp_model.CpModel
    x: dict[str, dict[tuple[str, int, str], cp_model.IntVar]]
    empty: list[str] = field(default_factory=list)   # sessions with no candidate at all
    soft_terms: list = field(default_factory=list)
    move_terms: list = field(default_factory=list)


def build(ds: Dataset, blocked=frozenset(), baseline: Assign | None = None, move_weight: int = 0) -> TimetableModel:
    m = cp_model.CpModel()
    x: dict[str, dict] = {}
    empty = []
    room_cells, fac_cells = defaultdict(list), defaultdict(list)
    grp_cells = defaultdict(list)           # (g, day, p) -> linear terms (non-basket x, basket occupancy)
    fac_day = defaultdict(list)
    basket_cover = defaultdict(lambda: defaultdict(list))   # basket -> (day, p) -> x
    basket_start = defaultdict(lambda: defaultdict(list))   # basket -> (day, start) -> x per session
    soft = []
    move = []

    for sid, s in ds.sessions.items():
        cands = candidates(ds, s, blocked)
        if not cands:
            empty.append(sid)
            continue
        x[sid] = {c: m.NewBoolVar(f"x[{sid},{c}]") for c in cands}
        m.AddExactlyOne(x[sid].values())
        prefs = [p for p in ds.faculty.get(s["faculty_id"], {}).get("preferences", []) if p.get("type") == "avoid"]
        for (day, start, rid), v in x[sid].items():
            per = block(start, s["duration"])
            for p in per:
                room_cells[(rid, day, p)].append(v)
                fac_cells[(s["faculty_id"], day, p)].append(v)
                if s.get("basket_slot"):
                    basket_cover[s["basket_slot"]][(day, p)].append(v)
                else:
                    for g in s["groups"]:
                        grp_cells[(g, day, p)].append(v)
            fac_day[(s["faculty_id"], day)].append(s["duration"] * v)
            if s.get("basket_slot"):
                basket_start[s["basket_slot"]][(day, start)].append((sid, v))
            # per-placement soft costs: S1, S5, S6
            cost = sum(2 * sum(1 for p in per if p in pr["periods"]) for pr in prefs if day in pr.get("days", ds.days))
            cost += 1 if ds.rooms[rid]["capacity"] and s["size"] / ds.rooms[rid]["capacity"] < 0.4 else 0
            cost += 1 if LAST_TEACHING in per else 0
            if cost:
                soft.append(cost * v)
        if move_weight and baseline is not None:
            b = baseline.get(sid)
            if b is not None and tuple(b) in x[sid]:
                move.append(move_weight * (1 - x[sid][tuple(b)]))
                m.AddHint(x[sid][tuple(b)], 1)
            elif b is not None:
                move.append(move_weight)   # baseline slot no longer allowed: it must move

    for cells in (room_cells, fac_cells):
        for vs in cells.values():
            if len(vs) > 1:
                m.Add(sum(vs) <= 1)

    # basket: one shared (day, start); occupancy counts once for groups
    basket_groups = {}
    for sid, s in ds.sessions.items():
        if s.get("basket_slot"):
            basket_groups.setdefault(s["basket_slot"], set()).update(s["groups"])
    basket_occ = {}
    for b, starts in basket_start.items():
        members = {sid for vs in starts.values() for sid, _ in vs}
        t = {k: m.NewBoolVar(f"t[{b},{k}]") for k in starts}
        m.AddExactlyOne(t.values())
        for k, tv in t.items():
            for sid in members:
                vs = [v for s2, v in starts[k] if s2 == sid]
                m.Add(sum(vs) == tv) if vs else m.Add(tv == 0)
        for (day, p), vs in basket_cover[b].items():
            occ = m.NewBoolVar(f"occ[{b},{day},{p}]")
            for v in vs:
                m.Add(occ >= v)
            m.Add(occ <= sum(vs))
            basket_occ[(b, day, p)] = occ
            for g in basket_groups[b]:
                grp_cells[(g, day, p)].append(occ)

    for vs in grp_cells.values():
        if len(vs) > 1:
            m.Add(sum(vs) <= 1)
    for (f, day), terms in fac_day.items():
        m.Add(sum(terms) <= ds.faculty[f].get("max_hours_per_day", 4))

    # S2 gaps and S3 long days, per group-day
    for g in ds.groups:
        for day in ds.days:
            o = [sum(grp_cells.get((g, day, p), [])) for p in range(1, LAST_TEACHING + 1)]
            if not any(grp_cells.get((g, day, p)) for p in range(1, LAST_TEACHING + 1)):
                continue
            n = len(o)
            before = [m.NewBoolVar("") for _ in range(n)]
            after = [m.NewBoolVar("") for _ in range(n)]
            for i in range(n):
                if i > 0:
                    m.Add(before[i] >= before[i - 1])
                    m.Add(before[i] >= o[i - 1])
                else:
                    m.Add(before[i] == 0)
                if i < n - 1:
                    m.Add(after[i] >= after[i + 1])
                    m.Add(after[i] >= o[i + 1])
                else:
                    m.Add(after[i] == 0)
                gap = m.NewBoolVar("")
                m.Add(gap >= before[i] + after[i] - 1 - o[i])
                soft.append(gap)
            hours = sum(o)
            over = m.NewIntVar(0, LAST_TEACHING, "")
            m.Add(over >= hours - 6)
            soft.append(3 * over)

    # S4 repeat lectures of a course on one day
    per_group_course = defaultdict(list)
    per_basket_course = defaultdict(list)
    for sid, s in ds.sessions.items():
        if sid not in x:
            continue
        for (day, start, rid), v in x[sid].items():
            if s.get("basket_slot"):
                per_basket_course[(s["course_id"], day)].append(v)
            elif s["kind"] == "lecture":
                for g in s["groups"]:
                    per_group_course[(g, day, s["course_id"])].append(v)
    for vs in list(per_group_course.values()) + list(per_basket_course.values()):
        if len(vs) > 1:
            extra = m.NewIntVar(0, len(vs), "")
            m.Add(extra >= sum(vs) - 1)
            soft.append(3 * extra)

    return TimetableModel(model=m, x=x, empty=empty, soft_terms=soft, move_terms=move)
