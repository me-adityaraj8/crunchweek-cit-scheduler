from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..llm import chat
from ..models import User
from ..schemas import VeloActionOut, VeloIn, VeloOut
from ..services import velo_agent, velo_tools
from ..services.velo import answer

router = APIRouter(tags=["velo"])


@router.post("/velo", response_model=VeloOut)
def velo(body: VeloIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Velo, the assistant on every page. With a model configured, the agent answers through typed tools
    that call the same services as the pages; without one (or if it can't be reached) the keyword router
    answers. Either way nothing changes here: changes are prepared, and run only through the confirm below."""
    out = velo_agent.run(db, user, body) if chat.available() else None
    if out is None:
        out = answer(db, user, body)
        out["conversation_id"] = velo_agent.record(db, user, body, out)
    return out


@router.post("/velo/actions/{action_id}/confirm", response_model=VeloActionOut)
def confirm(action_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Run a change Velo prepared, once, with the normal service and its checks. Repeating returns the first
    result; an expired or stale action is refused."""
    return velo_tools.confirm(db, user, action_id)


@router.post("/velo/actions/{action_id}/discard", response_model=VeloActionOut)
def discard(action_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return velo_tools.discard(db, user, action_id)


@router.get("/velo/conversations/{conversation_id}")
def conversation(conversation_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """The person's own thread, oldest first (empty for anyone else's)."""
    return velo_agent.messages_of(db, user, conversation_id)
