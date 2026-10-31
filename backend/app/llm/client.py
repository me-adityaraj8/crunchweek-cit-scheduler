"""The one place the product calls an LLM (Gemini, JSON-schema output). Any failure raises
LLMUnavailable, and every caller has a non-LLM fallback, so the app works without a key."""
import base64
import json
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


def transcribe(audio: bytes, mime: str) -> str:
    """Speech to text for the assistant's mic button. Returns "" when no words were heard."""
    if not settings.gemini_api_key and audio_transport is _post_audio:
        raise LLMUnavailable("No GEMINI_API_KEY configured")
    try:
        out = audio_transport(prompt("transcribe"), audio, mime)
    except Exception as e:
        raise LLMUnavailable(f"{type(e).__name__}: {e}"[:200]) from e
    return " ".join(str(out or "").split())


def status() -> str:
    if not settings.gemini_api_key:
        return "not configured (assistant falls back to rule-based parsing)"
    try:
        ask("Reply with JSON.", 'Return {"ok": true}', {"type": "OBJECT", "properties": {"ok": {"type": "BOOLEAN"}},
                                                       "required": ["ok"]})
        return "ok"
    except LLMUnavailable as e:
        return f"error: {e}"
