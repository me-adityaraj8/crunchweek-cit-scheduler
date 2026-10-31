"""Reword facts computed by the checker into plain sentences. Falls back to the facts themselves."""
from . import client


def reword(facts: list[str]) -> str:
    facts = [f for f in facts if f]
    plain = " ".join(f if f.endswith(".") else f + "." for f in facts)
    if not facts:
        return ""
    try:
        out = client.ask(client.prompt("reword"), "Facts:\n" + "\n".join(f"- {f}" for f in facts))
    except client.LLMUnavailable:
        return plain
    return out.strip() if isinstance(out, str) and out.strip() else plain
