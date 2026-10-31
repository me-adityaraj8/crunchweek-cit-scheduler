"""Chat with tool calling for Velo's agent, over the OpenAI-compatible API that Groq (the default) and
Gemini both serve. Any failure after the retries raises LLMUnavailable; Velo then answers with its rules."""
import time

import httpx

from ..config import settings
from .client import LLMUnavailable

URLS = {"groq": "https://api.groq.com/openai/v1/chat/completions",
        "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"}
RETRY_STATUS = {429, 500, 502, 503, 504}
NEXT_STATUS = RETRY_STATUS | {401, 403}     # a rejected key is worth trying the other provider for
MAX_WAIT_S = 4.0


def providers() -> list[tuple[str, str, str]]:
    """(name, key, model) for each provider with a key: the configured one first, the other as a fallback for
    rate limits and outages."""
    have = {"groq": (settings.groq_api_key, settings.groq_model),
            "gemini": (settings.gemini_api_key, settings.gemini_model)}
    order = [settings.llm_provider] + [n for n in have if n != settings.llm_provider]
    return [(n, have[n][0], have[n][1]) for n in order if n in have and have[n][0]]


def provider() -> tuple[str, str, str] | None:
    p = providers()
    return p[0] if p else None


def _ask(name: str, key: str, model: str, messages: list[dict], tools: list[dict]) -> dict:
    body = {"model": model, "messages": messages, "temperature": 0}
    if tools:
        body.update(tools=tools, tool_choice="auto")
    tries = settings.agent_retries + 1
    for attempt in range(tries):
        r = httpx.post(URLS[name], json=body, timeout=settings.agent_timeout_s,
                       headers={"Authorization": f"Bearer {key}"})
        if r.status_code in RETRY_STATUS and attempt < tries - 1:
            try:
                wait = float(r.headers.get("retry-after", ""))
            except ValueError:
                wait = 0.5 * 2 ** attempt
            time.sleep(min(max(wait, 0.2), MAX_WAIT_S))
            continue
        r.raise_for_status()
        return r.json()["choices"][0]["message"]
    raise LLMUnavailable("No answer after retries")


def _post(messages: list[dict], tools: list[dict]) -> dict:
    last: Exception | None = None
    for name, key, model in providers():
        try:
            return _ask(name, key, model, messages, tools)
        except httpx.HTTPStatusError as e:
            last = e
            if e.response.status_code not in NEXT_STATUS:
                raise
        except httpx.TransportError as e:       # timeout or connection failure: try the other provider
            last = e
    raise LLMUnavailable(f"Every model provider failed: {last}"[:200])


# tests replace this with a scripted model; signature (messages, tools) -> assistant message dict
transport = _post


def available() -> bool:
    return transport is not _post or provider() is not None


def chat(messages: list[dict], tools: list[dict]) -> dict:
    """One model turn: {"content": str | None, "tool_calls": [{"id", "function": {"name", "arguments"}}]}."""
    if not available():
        raise LLMUnavailable("No model key configured for Velo's agent")
    try:
        msg = transport(messages, tools)
    except LLMUnavailable:
        raise
    except Exception as e:      # timeout, HTTP error, rate limit after retries, malformed envelope
        raise LLMUnavailable(f"{type(e).__name__}: {e}"[:200]) from e
    if not isinstance(msg, dict):
        raise LLMUnavailable("The model returned no message")
    return msg


def name() -> str:
    p = provider()
    return f"{p[0]}:{p[2]}" if p else "none"
