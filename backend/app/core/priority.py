from collections import defaultdict

from .model import LAST_TEACHING, Dataset

CAT_WEIGHT = {"institute_event": 5, "guest_lecture": 4, "department_event": 3, "club_event": 2}


def effective_category(ds: Dataset, req: dict) -> str:
    """Requested category, capped at the highest one the requester's role may claim."""
    order = ds.priority_order
    cap = ds.role_cap.get(req.get("role"), "club_event")
    asked = order.index(req["requested_category"]) if req.get("requested_category") in order else len(order) - 1
    return order[max(asked, order.index(cap))]


def priority_key(ds: Dataset, req: dict) -> tuple[int, str]:
    return ds.priority_order.index(effective_category(ds, req)), req["submitted_at"]


def outranks(ds: Dataset, r1: dict, r2: dict) -> bool:
    """True if r1 has priority over r2: higher category, then earlier submission."""
    return priority_key(ds, r1) < priority_key(ds, r2)


def mandatory_cells(ds: Dataset) -> dict[tuple[str, str, int], int]:
    """(group, day, period) teaching cells inside the window of a booking that is mandatory for that group,
    weighted by the booking's category. The timetable tries to keep these free (as a tie-break only)."""
    out = defaultdict(int)
    for rid, req in ds.requests.items():
        if rid in ds.cancelled:
            continue
        w = CAT_WEIGHT.get(effective_category(ds, req), 1)
        for g in req.get("mandatory_for_groups", []):
            for win in req["windows"]:
                for p in range(max(1, win["from_period"]), min(win["to_period"], LAST_TEACHING) + 1):
                    out[(g, win["day"], p)] = max(out[(g, win["day"], p)], w)
    return dict(out)
