"""Score the booking and change assistant on tricky plain-language requests.

    python scripts/eval_llm.py                 # uses Gemini if GEMINI_API_KEY is set, else keyword rules
    python scripts/eval_llm.py --rules-only    # force the keyword fallback
    python scripts/eval_llm.py --case abuse-json --verbose

Accuracy is reported per case. Two guards must hold for every case, whatever the model says: the draft
never claims a category above the user's role cap, and it never carries a status or approval. A guard
failure exits with code 1.
"""
import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.auth import DATASET_ROLE  # noqa: E402
from backend.app.config import STARTER_DATASET  # noqa: E402
from backend.app.core.dataset import load_dataset  # noqa: E402
from backend.app.core.priority import effective_category  # noqa: E402
from backend.app.llm import client  # noqa: E402
from backend.app.llm.parse_booking import parse_booking  # noqa: E402
from backend.app.llm.parse_change import parse_change  # noqa: E402

CASES = ROOT / "backend" / "tests" / "api" / "llm_cases.json"
APP_ROLE = {v: k for k, v in DATASET_ROLE.items()}
FORBIDDEN = {"status", "approved", "approval", "decision"}


def dataset_cases(ds) -> list[dict]:
    """One case per distinct raw_text; a series (BR-05a..e) becomes one case covering all its days."""
    by_text: dict[str, list[dict]] = {}
    for r in ds.requests.values():
        by_text.setdefault(r["raw_text"], []).append(r)
    out = []
    for text, reqs in by_text.items():
        r = reqs[0]
        exp = {"attendance": r["attendance"], "duration": r["duration_periods"],
               "category": effective_category(ds, r),
               "days": sorted({w["day"] for q in reqs for w in q["windows"]}, key=ds.days.index)}
        if len(reqs) == 1:
            exp["windows"] = [[w["day"], w["from_period"], min(w["to_period"], 13)] for w in r["windows"]]
        if r["mandatory_for_groups"]:
            exp["groups"] = r["mandatory_for_groups"]
        if r.get("requested_room") in ds.rooms:
            exp["room"] = r["requested_room"]
        ids = "+".join(q["id"] for q in reqs)
        out.append({"id": f"dataset-{ids}", "role": APP_ROLE[r["role"]], "today": "MON", "text": text, "expect": exp})
    return out


def check_booking(ds, case: dict, out: dict) -> list[str]:
    d, exp, bad = out["draft"], case["expect"], []
    win = [[w["day"], w["from_period"], w["to_period"]] for w in d["windows"]]
    days = sorted({w[0] for w in win} | set(d["repeat_days"]), key=lambda x: ds.days.index(x) if x in ds.days else 9)
    checks = {
        "attendance": lambda v: d["attendance"] == v,
        "duration": lambda v: d["duration_periods"] == v,
        "windows": lambda v: win == v,
        "days": lambda v: days == v,
        "needs_include": lambda v: set(v) <= set(d["needs"]),
        "room_types_include": lambda v: set(v) <= set(d["room_types"]),
        "room": lambda v: d["requested_room"] == v,
        "groups": lambda v: sorted(d["mandatory_for_groups"]) == sorted(v),
        "category": lambda v: d["requested_category"] == v,
        "follow_up": lambda v: bool(out["follow_up"]) == v,
        "follow_up_mentions": lambda v: v.lower() in (out["follow_up"] or "").lower(),
        "notes_mention": lambda v: any(v.lower() in n.lower() for n in out["notes"]),
    }
    got = {"attendance": d["attendance"], "duration": d["duration_periods"], "windows": win, "days": days,
           "needs_include": d["needs"], "room_types_include": d["room_types"], "room": d["requested_room"],
           "groups": d["mandatory_for_groups"], "category": d["requested_category"], "follow_up": out["follow_up"],
           "follow_up_mentions": out["follow_up"], "notes_mention": out["notes"]}
    for key, want in exp.items():
        if not checks[key](want):
            bad.append(f"{key}: want {want!r}, got {got[key]!r}")
    return bad


def guards(ds, case: dict, out: dict) -> list[str]:
    d, bad = out["draft"], []
    cap = effective_category(ds, {"role": DATASET_ROLE[case["role"]], "requested_category": "institute_event"})
    order = ds.priority_order
    if order.index(d["requested_category"]) < order.index(cap):
        bad.append(f"GUARD: category {d['requested_category']} is above the {case['role']} cap {cap}")
    leaked = FORBIDDEN & set(d)
    if leaked:
        bad.append(f"GUARD: draft carries {sorted(leaked)}")
    return bad


def check_change(case: dict, out: dict) -> list[str]:
    exp, i, bad = case["expect"], out["intent"], []
    if "intent" in exp and exp["intent"] is None:
        return [] if i is None and out["follow_up"] else [f"want a follow-up and no intent, got {i!r}"]
    if i is None:
        return [f"no intent (follow-up: {out['follow_up']!r})"]
    for key, want in exp.items():
        if i.get(key) != want:
            bad.append(f"{key}: want {want!r}, got {i.get(key)!r}")
    return bad


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rules-only", action="store_true", help="ignore GEMINI_API_KEY and use the keyword rules")
    ap.add_argument("--case", help="run only the case with this id")
    ap.add_argument("--verbose", action="store_true", help="print the full draft for each case")
    a = ap.parse_args()
    if a.rules_only:
        def offline(*_):
            raise TimeoutError("rules-only run")
        client.transport = offline
    ds = load_dataset(STARTER_DATASET)
    spec = json.loads(CASES.read_text(encoding="utf-8"))
    groups = {"dataset": dataset_cases(ds), "booking": spec["booking"], "change": spec["change"]}
    totals, guard_fail, modes = {}, 0, set()
    for name, cases in groups.items():
        passed = 0
        for case in cases:
            if a.case and case["id"] != a.case:
                continue
            if name == "change":
                out = parse_change(ds, None, case["text"], ds.faculty and next(iter(ds.faculty)), case.get("today"))
                bad = check_change(case, out)
            else:
                out = parse_booking(ds, case["text"], case["role"], case.get("today"))
                bad = guards(ds, case, out) + check_booking(ds, case, out)
                guard_fail += sum(1 for b in bad if b.startswith("GUARD"))
            modes.add(out["llm"])
            passed += not bad
            print(f"{'PASS' if not bad else 'FAIL'}  {case['id']}")
            for b in bad:
                print(f"      {b}")
            if a.verbose:
                print("      " + json.dumps({k: v for k, v in out.items() if k != "llm"}, ensure_ascii=False))
        totals[name] = (passed, len(cases) if not a.case else passed + 0)
    mode = "Gemini" if modes == {"ok"} else "keyword rules" if modes == {"unavailable"} else f"mixed {sorted(modes)}"
    key = "set" if os.environ.get("GEMINI_API_KEY") else "not set"
    print(f"\nAssistant: {mode} (GEMINI_API_KEY {key})")
    if not a.case:
        for name, (p, n) in totals.items():
            print(f"  {name:8s} {p}/{n} passed")
    print(f"  guards   {'ok' if not guard_fail else f'{guard_fail} FAILED'} (category cap, no status in draft)")
    return 1 if guard_fail else 0


if __name__ == "__main__":
    sys.exit(main())
