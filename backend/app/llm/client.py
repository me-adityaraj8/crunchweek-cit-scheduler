"""The one place the product calls an LLM (Gemini, JSON-schema output). Any failure raises
LLMUnavailable, and every caller has a non-LLM fallback, so the app works without a key."""
import array
import base64
import io
import json
import sys
import wave
from pathlib import Path

import httpx

from ..config import settings

PROMPTS = Path(__file__).parent / "prompts"
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class LLMUnavailable(Exception):
    pass


def prompt(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text(encoding="utf-8")


def _post(system: str, user_text: str, schema: dict | None) -> str:
    cfg = {"temperature": 0}
    if schema is not None:
        cfg.update(responseMimeType="application/json", responseSchema=schema)
    body = {"systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user_text}]}],
            "generationConfig": cfg}
    r = httpx.post(URL.format(model=settings.gemini_model), json=body, timeout=settings.llm_timeout_s,
                   headers={"x-goog-api-key": settings.gemini_api_key})
    r.raise_for_status()
    parts = r.json()["candidates"][0]["content"]["parts"]
    return "".join(p.get("text", "") for p in parts)


# tests replace this with a fake; signature (system, user_text, schema) -> str
transport = _post


def ask(system: str, user_text: str, schema: dict | None = None) -> dict | str:
    if not settings.gemini_api_key and transport is _post:
        raise LLMUnavailable("No GEMINI_API_KEY configured")
    try:
        out = transport(system, user_text, schema)
    except Exception as e:      # timeout, HTTP error, quota, malformed envelope: all mean "use the fallback"
        raise LLMUnavailable(f"{type(e).__name__}: {e}"[:200]) from e
    if schema is None:
        return out
    try:
        data = json.loads(out)
    except (TypeError, json.JSONDecodeError) as e:
        raise LLMUnavailable("The model did not return JSON") from e
    if not isinstance(data, dict):
        raise LLMUnavailable("The model did not return a JSON object")
    return data


def _post_audio(system: str, audio: bytes, mime: str) -> str:
    body = {"systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"inlineData": {"mimeType": mime,
                                                                    "data": base64.b64encode(audio).decode()}}]}],
            "generationConfig": {"temperature": 0}}
    r = httpx.post(URL.format(model=settings.gemini_model), json=body, timeout=max(settings.llm_timeout_s, 20),
                   headers={"x-goog-api-key": settings.gemini_api_key})
    r.raise_for_status()
    parts = r.json()["candidates"][0]["content"].get("parts", [])
    return "".join(p.get("text", "") for p in parts)


# tests replace this with a fake; signature (system, audio, mime) -> str
audio_transport = _post_audio


VOICE_RMS = 400          # 16-bit level a voice near the mic clears easily; room hiss stays well under it
MIN_VOICED_S = 0.2


def voiced_seconds(audio: bytes) -> float | None:
    """How much of a 16-bit PCM WAV is louder than room noise, in seconds (20 ms frames). None when it
    isn't a WAV this can read, so other formats go to the model unchecked."""
    try:
        with wave.open(io.BytesIO(audio)) as w:
            if w.getsampwidth() != 2:
                return None
            rate, ch = w.getframerate(), w.getnchannels()
            pcm = array.array("h", w.readframes(w.getnframes()))
    except (wave.Error, EOFError, ValueError):
        return None
    if sys.byteorder == "big":
        pcm.byteswap()
    step = max(1, rate * ch // 50)
    loud = 0
    for i in range(0, len(pcm) - step + 1, step):
        frame = pcm[i:i + step]
        if (sum(x * x for x in frame) / step) ** 0.5 > VOICE_RMS:
            loud += 1
    return loud / 50


def transcribe(audio: bytes, mime: str) -> str:
    """Speech to text for the assistant's mic button. Returns "" when no words were heard, including for a
    recording with no voice in it: speech models invent sentences for silence, so that never reaches them."""
    voiced = voiced_seconds(audio)
    if voiced is not None and voiced < MIN_VOICED_S:
        return ""
    if not settings.gemini_api_key and audio_transport is _post_audio:
        raise LLMUnavailable("No GEMINI_API_KEY configured")
    try:
        out = audio_transport(prompt("transcribe"), audio, mime)
    except Exception as e:
        raise LLMUnavailable(f"{type(e).__name__}: {e}"[:200]) from e
    return " ".join(str(out or "").split())


def _post_tts(text: str, voice: str) -> tuple[str, str]:
    """Gemini text-to-speech: returns (mime type, base64 audio) from the first audio part."""
    body = {"contents": [{"parts": [{"text": text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    r = httpx.post(URL.format(model=settings.gemini_tts_model), json=body, timeout=max(settings.llm_timeout_s, 20),
                   headers={"x-goog-api-key": settings.gemini_api_key})
    r.raise_for_status()
    for part in r.json()["candidates"][0]["content"].get("parts", []):
        if "inlineData" in part:
            return part["inlineData"].get("mimeType", ""), part["inlineData"].get("data", "")
    return "", ""


# tests replace this with a fake; signature (text, voice) -> (mime, base64 audio)
tts_transport = _post_tts


def _wav(pcm: bytes, rate: int, channels: int = 1, bits: int = 16) -> bytes:
    block = channels * bits // 8
    return (b"RIFF" + (36 + len(pcm)).to_bytes(4, "little") + b"WAVEfmt " + (16).to_bytes(4, "little")
            + (1).to_bytes(2, "little") + channels.to_bytes(2, "little") + rate.to_bytes(4, "little")
            + (rate * block).to_bytes(4, "little") + block.to_bytes(2, "little") + bits.to_bytes(2, "little")
            + b"data" + len(pcm).to_bytes(4, "little") + pcm)


def speak(text: str) -> bytes:
    """Velo's reply as speech, as a WAV. Raises LLMUnavailable on any failure, including empty audio:
    the browser then uses its own voice or shows text, and never plays silence as if it were speech."""
    if not settings.gemini_api_key and tts_transport is _post_tts:
        raise LLMUnavailable("No GEMINI_API_KEY configured")
    try:
        mime, data = tts_transport(text, settings.gemini_tts_voice)
        audio = base64.b64decode(data or "")
    except Exception as e:
        raise LLMUnavailable(f"{type(e).__name__}: {e}"[:200]) from e
    if not audio:
        raise LLMUnavailable("The voice model returned no audio")
    if audio[:4] == b"RIFF":
        return audio
    rate = 24000          # Gemini speaks 16-bit mono PCM; the mime type names the rate ("...;rate=24000")
    for piece in (mime or "").split(";"):
        key, _, value = piece.strip().partition("=")
        if key == "rate" and value.isdigit():
            rate = int(value)
    return _wav(audio, rate)


def status() -> str:
    if not settings.gemini_api_key:
        return "not configured (assistant falls back to rule-based parsing)"
    try:
        ask("Reply with JSON.", 'Return {"ok": true}', {"type": "OBJECT", "properties": {"ok": {"type": "BOOLEAN"}},
                                                       "required": ["ok"]})
        return "ok"
    except LLMUnavailable as e:
        return f"error: {e}"
