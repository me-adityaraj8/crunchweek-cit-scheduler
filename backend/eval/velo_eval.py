"""Run Velo's evaluation scenarios against a running deployment, over HTTP, with the demo accounts and the real
data it holds. Nothing is confirmed, so it is safe against production.

    python -m backend.eval.velo_eval --base http://localhost:8765 [--only book] [--json out.json]

The demo password comes from DEMO_PASSWORD (default demo1234). With the keyword router (no model configured)
its intents are mapped to the tool that would answer them, so both modes are scored on the same scale."""
import argparse
import json
import os
import re
import statistics
import sys
import time

import httpx

from .scenarios import S

# what the keyword router's intents correspond to among the agent's tools
INTENT_TOOL = {"find_rooms": "find_available_rooms", "book_venue": "create_booking_draft",
               "booking_status": "get_booking_status", "cancel_booking": "cancel_booking",
               "explain_session": "explain_scheduling_decision", "alternatives": "explain_scheduling_decision",
               "approvals": "get_pending_approvals", "proposals": "list_change_proposals",
               "navigate": "navigate_to_page"}
LEGACY_ACTIONS = {"preview", "confirm_cancel", "alternatives"}


def login(c: httpx.Client, email: str, pw: str) -> dict:
    r = c.post("/api/auth/login", json={"email": email, "password": pw})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def used_tools(out: dict) -> list[str]:
    if out.get("mode") == "agent":
        return out.get("tools") or []
    t = INTENT_TOOL.get(out.get("intent"))
    return [t] if t else []


def has_action(out: dict) -> bool:
    return any(c["kind"] == "action" or c["kind"] in LEGACY_ACTIONS for c in out.get("cards", []))


def card_ok(out: dict, want: dict) -> bool:
    for c in out.get("cards", []):
        if c["kind"] != want["kind"]:
            continue
        if all((set(v) <= set(c["data"].get(k) or [])) if isinstance(v, list) else c["data"].get(k) == v
               for k, v in want.items() if k != "kind"):
            return True
    return False


def run_one(c: httpx.Client, heads: dict, s: dict) -> dict:
    cid, out, lat = None, {}, []
    for text in s["turns"]:
        t0 = time.monotonic()
        r = c.post("/api/velo", json={"text": text, "page": "/", "today": "MON", "conversation_id": cid},
                   headers=heads[s["who"]], timeout=90)
        lat.append((time.monotonic() - t0) * 1000)
        if r.status_code != 200:
            return {"id": s["id"], "ok": False, "fail": [f"HTTP {r.status_code}: {r.text[:120]}"], "latency": lat}
        out = r.json()
        cid = out.get("conversation_id")
    tools = used_tools(out)
    reply = out.get("reply", "")
    clarified = not tools and reply.rstrip().endswith("?")
    checks = {}
    if "tools" in s:
        checks["tool"] = any(t in tools for t in s["tools"])
    if "never" in s:
        checks["permitted"] = not any(t in tools for t in s["never"])
    if "action" in s:
        checks["action"] = has_action(out) == s["action"]
    if "ask" in s:
        checks["ask"] = clarified == s["ask"]
    if "says" in s:
        checks["says"] = re.search(s["says"], reply) is not None
    if "card" in s:
        checks["card"] = card_ok(out, s["card"])
    return {"id": s["id"], "who": s["who"], "turns": len(s["turns"]), "mode": out.get("mode"), "tools": tools,
            "reply": reply[:160], "checks": checks, "ok": all(checks.values()), "latency": lat,
            "clarified": clarified, "expected_ask": s.get("ask", False),
            "tool_errors": sum(1 for c in out.get("cards", []) if c["kind"] == "error"),
            "fail": [k for k, v in checks.items() if not v]}


def report(rows: list[dict]) -> dict:
    lat = [x for r in rows for x in r["latency"]]

    def rate(key):
        xs = [r["checks"][key] for r in rows if key in r.get("checks", {})]
        return round(100 * sum(xs) / len(xs), 1) if xs else None
    multi = [r for r in rows if r.get("turns", 1) > 1]
    asked = [r for r in rows if r.get("clarified") and not r.get("expected_ask")]
    return {"scenarios": len(rows), "modes": sorted({r.get("mode") or "error" for r in rows}),
            "task_completion_pct": round(100 * sum(r["ok"] for r in rows) / len(rows), 1),
            "tool_selection_pct": rate("tool"), "no_forbidden_tool_pct": rate("permitted"),
            "action_vs_read_pct": rate("action"), "clarification_correct_pct": rate("ask"),
            "reply_checks_pct": rate("says"), "data_checks_pct": rate("card"),
            "follow_up_pct": round(100 * sum(r["ok"] for r in multi) / len(multi), 1) if multi else None,
            "unnecessary_clarification_pct": round(100 * len(asked) / len(rows), 1),
            "forbidden_tool_uses": sum(1 for r in rows if r.get("checks", {}).get("permitted") is False),
            "latency_avg_ms": round(statistics.mean(lat)) if lat else None,
            "latency_p95_ms": round(sorted(lat)[max(0, int(len(lat) * 0.95) - 1)]) if lat else None}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8765")
    ap.add_argument("--only", default="")
    ap.add_argument("--json", default="")
    ap.add_argument("--pace", type=float, default=0, help="seconds between scenarios (free model tiers cap tokens/min)")
    a = ap.parse_args(argv)
    pw = os.environ.get("DEMO_PASSWORD") or "demo1234"
    rows = []
    with httpx.Client(base_url=a.base) as c:
        heads = {who: login(c, who, pw) for who in {s["who"] for s in S}}
        for s in S:
            if a.only and not any(o in s["id"] for o in a.only.split(",")):
                continue
            if rows and a.pace:
                time.sleep(a.pace)
            r = run_one(c, heads, s)
            rows.append(r)
            print(f"{'PASS' if r['ok'] else 'FAIL'} {r['id']:<14} {','.join(r.get('tools', [])) or '-':<44} "
                  f"{' '.join(r['fail'])}", flush=True)
    summary = report(rows)
    print(json.dumps(summary, indent=2))
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump({"summary": summary, "rows": rows}, f, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
