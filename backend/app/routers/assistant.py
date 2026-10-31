from fastapi import APIRouter, Depends, File, Response, UploadFile
from sqlalchemy.orm import Session

from ..auth import current_user, require_roles
from ..db import get_db
from ..errors import ApiError
from ..llm import client as llm
from ..llm.parse_booking import parse_booking
from ..llm.parse_change import parse_change
from ..models import User
from ..schemas import AssistantIn, BookingParseOut, ChangeParseOut, SpeakIn, TranscribeOut
from ..services import proposals, state

router = APIRouter(tags=["assistant"])

MAX_AUDIO_BYTES = 4 * 1024 * 1024        # ~2 minutes of 16 kHz mono WAV; also under Vercel's request limit


@router.post("/assistant/transcribe", response_model=TranscribeOut)
async def transcribe(audio: UploadFile = File(...), user: User = Depends(current_user)):
    """Voice input for the assistant: a short recording in, its text out. The text is put in the message
    box for the person to read and send, so it goes through exactly the same checks as typed text."""
    mime = (audio.content_type or "").split(";")[0].strip().lower()
    if not mime.startswith("audio/"):
        raise ApiError(415, "unsupported_media", "Send an audio recording (WAV)")
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise ApiError(413, "too_large", "That recording is too long. Keep it under two minutes.")
    try:
        text = llm.transcribe(data, mime)
    except llm.LLMUnavailable:
        raise ApiError(503, "llm_unavailable", "Voice input needs the AI assistant, which isn't available right "
                                               "now. Type your request instead.")
    if not text:
        raise ApiError(422, "no_speech", "I couldn't hear any words. Try again a little closer to the mic.")
    return {"text": text}


@router.post("/assistant/speak", response_class=Response,
             responses={200: {"content": {"audio/wav": {}}, "description": "Velo's reply as speech"}})
def speak(body: SpeakIn, user: User = Depends(current_user)):
    """Velo's reply as speech (voice mode). 503 when the voice model isn't available, so the browser can
    use its own voice; never an empty or made-up sound."""
    try:
        wav = llm.speak(body.text)
    except llm.LLMUnavailable:
        raise ApiError(503, "tts_unavailable", "Velo's voice isn't available right now.")
    return Response(content=wav, media_type="audio/wav", headers={"Cache-Control": "no-store"})


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
