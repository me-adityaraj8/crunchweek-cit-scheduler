# Handoff

_Last updated: 2026-10-31 by Varun (Laptop 2)_

## Current state
- Design: docs/DESIGN.md. Build plan: docs/PLAN.md.
- **Lane A (engine) is done** — `backend/app/core/` and `backend/app/solver/`, tests in `backend/tests/engine/`.
  - Timetable: 0 hard violations, soft penalty 3 on the public data (optimal in ~20s with 8 threads; only ~201 after 30s on 1 thread).
  - Exams: all 41 placed, 0 violations, 0 same-day penalty (~7s).
  - Spectra week: booking score 67/70, 0 priority inversions. BR-09 is impossible (1,200 people, biggest venue seats 800); BR-17 asks for P13–14, so it gets an alternative.
  - Sample disruption: 13–14 sessions moved (exactly the ones hit by CR-102 closing and F07's Mondays), 0 hard violations under the official validator.
  - Full pipeline export passes `validator.py` with 0 hard violations.
- **Lane B (API + AI) is built and tested locally** (Laptop 2): see the Lane B section below.
- Task 0 (deploy + hosting check) and Lane C (frontend) are not started.

## Engine API for Lane B (see PLAN.md Interfaces blocks)
- `core.dataset`: `load_dataset(path|dict)`, `apply_changes(ds, change_file)` → raise `DatasetError` with a readable message for bad JSON, missing fields, wrong types or unknown faculty/room/session ids. Map it to HTTP 400.
- `solver.timetable.solve_timetable(ds, time_limit_s, ...)` → `SolveResult(status, assign, soft, soft_total, solve_ms)`. A fresh solve also keeps groups free where a Spectra booking is mandatory for them (tie-break only, soft score unchanged).
- `solver.exams.solve_exams(ds, time_limit_s)` → `ExamResult(status, exams, penalty)`
- `solver.fest.decide_fest(ds, assign, extra_requests=[])` → `FestResult(decisions, overrides)`
- `solver.repair.repair(ds_after, baseline, fest, time_limit_s, extra_requests=[])` → `RepairResult(status, assign, diff, moved, time_changed, room_only, soft_before, soft_after, conflicts, fest)`.
  - Spectra bookings are decided again on the repaired timetable. **Export `RepairResult.fest` in schedule_after**, not the old FestResult.
  - Bookings whose decision changed come back as conflicts with code `booking_changed`. Show them in the diff view.
  - Live app bookings never displace classes (only dataset institute events do). Mint `APP-` ids so they never collide with dataset ids.
  - `proven_minimal` says the move count is proven optimal. Show "minimal (proven)" in the diff view.
  - `status="infeasible"` comes with named `conflicts` (codes: `fac_un`, `daily`, `room_un`, `group_clash`, `session`, `booking`, ...). `timeout` means no answer within the limit.
  - Use `submitted_at` in the same ISO format as the dataset (`2027-01-26T09:45:00+05:30`). Priority ties are broken by comparing these strings.
- `core.checker`: `check_timetable`, `check_move`, `check_booking`, `free_rooms`, `check_fest` (returns violations, warnings, stats), `check_exams`, `full_report`
- `core.explain`: `explain_session(ds, assign, sid)`, `explain_booking(ds, fest, request_id)`
- `core.export.build_schedule(ds, assign, fest, exams, team)`

## Engine QA (2026-10-31, Laptop 1) — where it stopped
Passed when last run (each suite run separately after its fixes):
- `test_qa_rules.py` 253/253: every hard rule H1–H14, B1–B3, E1–E2 and soft S1–S6 match `validator.py` exactly, plus 230 fuzzed schedules.
- `test_qa_bruteforce.py`: solver optimum = exhaustive search on 40 random tiny instances (24 by default; `QA_BRUTE_SEEDS=40` for more).
- `test_qa_adversarial.py` 42/42: malformed datasets, fixed slots, random Spectra sets (validator: 0 hard, 0 inversions), forced displacements, random exams, explanations consistent with the checker.
- `test_qa_repair.py` 17/17: random disruptions valid and equal to an independently computed minimum, named infeasibility causes, guards.
- `test_qa_booking_aware.py` 2/2: soft 3 (optimal), booking score 67/70.

**Full suite confirmed:** 404 passed, 0 failed (13m39s, slow tests included) on the pushed code. To re-run:
```
.venv/bin/python -m pytest backend/tests/engine -q            # ~20 min with slow tests
.venv/bin/python -m pytest backend/tests/engine -q -m "not slow"   # quicker
.venv/bin/python backend/tests/engine/bench_engine.py         # timings (not run yet)
```
Known minor gaps (not fixed): basket sessions of different durations are modelled slightly stricter than the validator; `Decision.displaces` of an earlier event can go stale after a later displacement re-solve (overrides themselves are correct).

## Engine check on Laptop 2 (2026-10-31, Varun)
Same code as `8531cb1`, Windows, Python 3.13, ortools 9.15.6755, 16 threads. On Windows the venv python is `.venv/Scripts/python`.
- Full pipeline (timetable → exams → Spectra → export, then sample disruption → repair → export), checked with `validator.py`:
  - `schedule.json`: 0 hard, soft 3 (optimal, 28s), exams 0 penalty (9s), booking score 67/70, 0 inversions.
  - `schedule_after.json`: 0 hard, soft 4, 16 moved (8 time, 8 room only), `proven_minimal` True (0.7s). The count differs from Laptop 1's 13–14 because the base timetable differs between runs.
- `pytest backend/tests/engine -m "not slow"`: **353 passed, 2 failed** (6m55s). Both pass on Laptop 1, so they depend on the machine:
  - `test_simple_repairs_are_fast`: repair took 16.4s, limit 15s.
  - `test_timeout_on_an_impossible_change_still_names_the_cause`: with every `lab_cs` room closed, `explain_infeasible` (1 worker, 10s) did not prove infeasibility in time, so `repair` returned `timeout` instead of naming CS-LAB.

Risks this points to:
1. **Hosting CPU.** Timetable quality depends on cores (soft ~201 after 30s on 1 thread vs 3 on 8). Judges generate in our app, so measure on the real host before choosing it.
2. **Infeasibility on a slow host.** `explain_infeasible` is single-threaded. If it times out, judges get "timeout" instead of a named conflict (rescheduling marks). A counting check in `quick_conflicts` would catch "every room of the type a session needs is closed" instantly: compare the hours sessions need per room type with the free room-hours of that type.

## Lane B — API + AI (2026-10-31, Varun, Laptop 2)
Run: `python -m uvicorn backend.app.main:app --port 8000`, then `/api/docs`. No env needed locally (SQLite `local.db`, demo password `demo1234`, no LLM key → keyword fallback). Every route and demo account: README.md. Shapes: `backend/app/schemas.py`, which is the contract for Lane C. Generate TS types with `npx openapi-typescript http://localhost:8000/api/openapi.json -o frontend/src/api/types.ts`.

Layout: `routers/` (HTTP only) → `services/` (`state.py` dataset/versions/reset/settings, `bookings.py` Spectra requests, `proposals.py` changes) → engine. `llm/` = Gemini client, `prompts/*.md`, parsers.

What it does (all checked by tests in `backend/tests/api/`, 44 passing):
- Auth: JWT + bcrypt, role guards. Reset keeps account ids, so the Admin stays logged in. Dataset upload: bad JSON or bad data → 400 and the old data stays.
- Generate: saves only checker-clean timetables, then decides Spectra week straight away. Views by group/faculty/room/all, regular or Spectra week (with overrides and bookings). Faculty may only open their own faculty view.
- Manual move: `check-move` dry run (violations + valid suggestions) and `manual` (a 422 with rule + suggestions, or a pending proposal).
- Bookings: live requests `APP-xxxx` join the dataset pool and everything is re-decided by `decide_fest`. The role cap is applied. `submitted_at` is never earlier than the dataset's requests, so a new request can't win ties. Bookings of lab rooms wait for the owning department's coordinator (`settings.lab_owners`, default by room type), or the Admin if that coordinator made it. Owner cancel. Every decision set is re-verified with `check_fest` over dataset + app requests before saving.
- Changes: change file / ChangeIntent / faculty leave → `repair` → proposal (pending or infeasible with named conflicts). Approve = Admin only; 409 if stale or already decided; re-checked before applying. Self-approval is blocked for requests (kinds `request`, `unavailability`); the Admin's own change files and manual moves are reviewed and applied by the Admin (otherwise a single Admin could never apply a change file).
- Assistant: Gemini JSON-schema extraction, then code: role cap, kal/parso, times → periods from the calendar, "mic" → pa_system, named room that fails a need dropped with a note, attendance from mandatory groups, follow-up questions. Without a key or on any failure: keyword rules (13/25 dataset texts exact, the rest partly). Change assistant picks the best valid slot when no target is given.
- Export `?after=0|1`. `scripts/make_exports.py --base-url ... [--out dir]` drives the API (reset → generate → exams → decide → export → sample disruption → approve → export) and runs the validator.

Verified end to end through a real uvicorn server on Laptop 2: schedule.json 0 hard, soft 3 (optimal, 18.5s), exams 0, bookings 67/70, 0 inversions, 2 overrides. schedule_after.json 0 hard, 17 moved (9 time, 8 room only). `exports/` is **not** committed: produce it from the deployed app at the end.

Engine change (Lane A file, small): `solver/fest.py` `decide_fest(..., cache=None)`. Week-7 displacement re-solves are cached per timetable version (kept in `version.fest["cache"]`). Without it, every booking submit re-ran up to 3 CP-SAT solves (~20s each), and the non-deterministic solver reshuffled Week-7 overrides. The engine fest/repair/export tests still pass.

Not done in Lane B: Task 0 deploy check (needs Vercel/Neon/Gemini accounts), `scripts/eval_llm.py` live LLM eval, `vercel.json` frontend build (add when `frontend/` exists). `vercel.json` currently routes `/api/*` only and is untested on Vercel.

## Deploy prep (2026-10-31, Varun, Laptop 2)
**Backend size vs a Vercel Python function.** Installed the Linux (manylinux x86_64, cp312) wheels for `requirements.txt` and measured them: **310 MB unzipped**.
- Biggest pieces: ortools 82.5 MB, pandas 76.1, numpy 68 (with its libs), sqlalchemy 27.7, psycopg binary 20.
- Of that, 66 MB is `__pycache__` and 53 MB is test folders inside pandas/numpy. Without those it's ~181 MB.
- Vercel documents a 250 MB function limit; check the current number. Whether its Python build keeps caches and tests is unknown.
- pandas can't be dropped: `ortools/sat/python/cp_model.py` imports it at load time.
- Dropped `uvicorn[standard]` extras (−10 MB, unused).

So the Vercel function may or may not fit. And CPU matters as much as size: judges generate in the app, and CP-SAT quality depends on cores. Simplest safe plan: backend on Railway/Render/Fly using the new `Procfile` (`uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`), SPA on Vercel with a rewrite of `/api/(.*)` to `https://<backend>/api/$1`. The browser still sees one origin, so no CORS. The Vercel-only `vercel.json` stays for trying Vercel first.

**Assistant eval.** `scripts/eval_llm.py` with cases in `backend/tests/api/llm_cases.json`: the 25 dataset texts (expected values from the dataset), the 8 public samples, 16 tricky ones (priority abuse, prompt injection, JSON injection, vague time/day/size, conditions, weekend, Hinglish kal/parso/se-tak, too big, unknown room, accessible, compulsory group) and 4 change requests. Guards (category never above the role cap, no status in a draft) fail the run if broken.
- Keyword fallback, no key: dataset 17/20, tricky + samples 24/24, change 4/4, guards ok. The 3 misses are judgement calls: BR-04 window 10–12 vs 10–13; BR-09 has no length, we assume 2 h, the dataset says 3; BR-17 "10 pm to midnight" gets a "too late, pick an earlier time" question.
- Not yet run with Gemini (no key). Once `GEMINI_API_KEY` is in `.env`: `python scripts/eval_llm.py`.
- Parser changes from this: an event type not stated → the usual one for the role (admin institute, coordinator department, faculty guest lecture, club club), marked guessed. Start time without a length → 1 hour. A day without a time → any teaching hour that day plus a question. "The auditorium" → AUD when only one room has that type. A start past the last period → a question.

## Next steps
1. Task 0: decide the host. **Set `JWT_SECRET` first** (32+ random chars, `python -c "import secrets; print(secrets.token_urlsafe(48))"`): a deployed app refuses to start without it, because the fallback secret is in this public repo. Neon + Gemini key; deploy; open `/api/health` (add `?deep=1` to test the LLM). **Measure a real `POST /api/timetable/generate` on the host.** See Deploy prep above for the size and CPU numbers.
2. Lane C (frontend) is being built in `frontend/` by Varun's separate UI/UX session (on Laptop 2). Don't edit `frontend/` from another session meanwhile. When it lands, `vercel.json` needs the SPA build (`frontend/dist`) and an `index.html` fallback.
3. Then `scripts/make_exports.py` against the deployed URL and commit `exports/`.

## Before you start
```
git pull origin main
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt   # Windows: .venv/Scripts/pip
.venv/bin/python -m pytest backend/tests/api -q      # ~3 min
.venv/bin/python -m pytest backend/tests/engine -q   # ~6 min, solver-heavy (run the two folders separately)
```
Read PROJECT_CONTEXT.md, this file, and `starter_pack/README.md`.
