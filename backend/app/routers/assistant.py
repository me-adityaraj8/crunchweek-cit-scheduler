from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import current_user, require_roles
from ..db import get_db
from ..llm.parse_booking import parse_booking
from ..llm.parse_change import parse_change
from ..models import User
from ..schemas import AssistantIn, BookingParseOut, ChangeParseOut
from ..services import proposals, state

router = APIRouter(tags=["assistant"])


@router.post("/assistant/booking", response_model=BookingParseOut)
def booking(body: AssistantIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Plain English/Hinglish -> an editable draft. Never books anything: the person checks the form and
    submits it to /bookings, where code decides."""
    _, ds = state.active_dataset(db)
    return parse_booking(ds, body.text, user.role, body.today)


@router.post("/assistant/change", response_model=ChangeParseOut)
def change(body: AssistantIn, db: Session = Depends(get_db),
           user: User = Depends(require_roles("faculty", "coordinator", "admin"))):
    row, ds = state.active_dataset(db)
    v = state.active_version(db, row)
    assign = state.to_assign(v.assignments) if v else {}
    out = parse_change(ds, assign, body.text, user.faculty_id, body.today)
    intent = out["intent"]
    if intent and intent["type"] == "move_session" and not intent.get("target") and v is not None:
        # no usable target: offer the best slot the checker allows (on the day asked for, if any)
        want = intent.get("_target_day")
        opts = proposals.suggestions(ds, assign, intent["session_id"], limit=20)
        pick = next((o for o in opts if not want or o["day"] == want), None)
        if pick:
            intent["target"] = pick
            out["notes"].append(f"Proposed {pick['day']} P{pick['start']} in {pick['room']}: the valid slot with "
                                f"the least extra soft penalty")
        else:
            out["intent"], out["follow_up"] = None, "No valid slot is free for that session" + \
                (f" on {want}" if want else "") + ". Try another day."
    if out["intent"]:
        out["intent"].pop("_target_day", None)
    return out
