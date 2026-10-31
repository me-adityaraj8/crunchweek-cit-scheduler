"""Produce exports/schedule.json and exports/schedule_after.json by driving the app's API, then check
both with the official validator. Nothing here computes a schedule: the app does.

    python scripts/make_exports.py --base-url https://<app>.vercel.app --password <DEMO_PASSWORD>
    python scripts/make_exports.py            # local app on http://localhost:8000
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "starter_pack" / "data" / "cit_public.json"
SAMPLE = ROOT / "starter_pack" / "examples" / "sample_disruption.json"
OUT = ROOT / "exports"


def call(c: httpx.Client, method: str, path: str, **kw):
    r = c.request(method, path, **kw)
    if r.status_code >= 400:
        sys.exit(f"{method} {path} failed ({r.status_code}): {r.text[:500]}")
    return r.json()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--password", default=os.environ.get("DEMO_PASSWORD") or "demo1234")
    ap.add_argument("--out", default=str(OUT), help="folder to write the two files to")
    ap.add_argument("--time-limit", type=float, default=None, help="solver seconds (default: the app's setting)")
    a = ap.parse_args()
    out = Path(a.out)

    with httpx.Client(base_url=a.base_url.rstrip("/") + "/api", timeout=320,
                      limits=httpx.Limits(max_keepalive_connections=0)) as c:  # long solves: no idle reuse
        tok = call(c, "POST", "/auth/login", json={"email": "admin@cit.demo", "password": a.password})["token"]
        c.headers["Authorization"] = f"Bearer {tok}"
        call(c, "POST", "/admin/reset")
        limit = {"time_limit_s": a.time_limit} if a.time_limit else {}
        g = call(c, "POST", "/timetable/generate", json=limit)
        print(f"timetable: {g['status']}, {g['placed']}/{g['total']} placed, soft {g['soft_total']}, {g['solve_ms']} ms")
        e = call(c, "POST", "/exams/generate", json=limit)
        print(f"exams: {len(e['exams'])}/{e['total']}, penalty {e['penalty']}")
        f = call(c, "POST", "/fest/decide-all")
        print(f"spectra: {f['approved']} approved, {f['alternatives']} alternatives, {f['rejected']} rejected, "
              f"score {f['booking_score']}")
        out.mkdir(parents=True, exist_ok=True)
        before = call(c, "GET", "/export/schedule.json")
        (out / "schedule.json").write_text(json.dumps(before, indent=1), encoding="utf-8")

        p = call(c, "POST", "/changes/file", content=SAMPLE.read_bytes(), headers={"Content-Type": "application/json"})
        print(f"sample disruption: proposal {p['id']} {p['status']}, {p['moved']} moved "
              f"({p['time_changed']} time, {p['room_only']} room only), {p['added']} added")
        if p["status"] != "pending":
            sys.exit(f"proposal not approvable: {p['conflicts']}")
        call(c, "POST", f"/changes/{p['id']}/approve", json={"note": "exports"})
        after = call(c, "GET", "/export/schedule.json", params={"after": 1})
        (out / "schedule_after.json").write_text(json.dumps(after, indent=1), encoding="utf-8")

    val = [sys.executable, str(ROOT / "starter_pack" / "validator.py"), "--data", str(DATA)]
    print("\n== validator: schedule.json")
    subprocess.run(val + ["--schedule", str(out / "schedule.json")], check=False)
    print("\n== validator: schedule_after.json")
    subprocess.run(val + ["--schedule", str(out / "schedule_after.json"), "--disruption", str(SAMPLE),
                          "--baseline", str(out / "schedule.json")], check=False)


if __name__ == "__main__":
    main()
