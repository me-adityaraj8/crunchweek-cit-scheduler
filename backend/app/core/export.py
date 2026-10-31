"""schedule.json in the starter-pack export format."""
from .model import Assign, Dataset

BOOKING_FIELDS = ("request_id", "status", "day", "start_period", "end_period", "room_id", "reason")


def _booking_row(d) -> dict:
    row = {k: getattr(d, k) for k in BOOKING_FIELDS}
    if row["status"] == "rejected":
        return {"request_id": row["request_id"], "status": "rejected", "reason": row["reason"]}
    return row


def build_schedule(ds: Dataset, assign: Assign, fest=None, exams=None, team: str = "Velora",
                   request_ids: set[str] | None = None) -> dict:
    """fest: FestResult or None; exams: ExamResult or None. All decisions are exported (live app bookings
    too; the validator skips ids it doesn't know) unless request_ids narrows them."""
    out = {"team": team, "dataset_id": ds.dataset_id,
           "sessions": [{"session_id": s, "day": d, "start_period": p, "room_id": r}
                        for s, (d, p, r) in sorted(assign.items())]}
    if fest is not None:
        out["fest_week"] = {"bookings": [_booking_row(d) for d in fest.decisions
                                         if request_ids is None or d.request_id in request_ids],
                            "session_overrides": list(fest.overrides)}
    if exams is not None:
        out["exams"] = list(exams.exams)
    return out
