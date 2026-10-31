from .model import Dataset

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
