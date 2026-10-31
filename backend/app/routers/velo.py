from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import User
from ..schemas import VeloIn, VeloOut
from ..services.velo import answer

router = APIRouter(tags=["velo"])


@router.post("/velo", response_model=VeloOut)
def velo(body: VeloIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Velo, the assistant on every page: a message (with the page and what it has open) in, a short reply
    with cards out. Read-only by design: it saves nothing, and every change it offers is sent by the
    browser to the usual endpoint after the person confirms."""
    return answer(db, user, body)
