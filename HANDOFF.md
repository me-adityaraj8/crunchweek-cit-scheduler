# Handoff

_Last updated: 2026-10-31 by Aditya (Laptop 1)_

## Current state
- Design: docs/DESIGN.md. Build plan: docs/PLAN.md.
- **Lane A (engine) is done** — `backend/app/core/` and `backend/app/solver/`, tests in `backend/tests/engine/`.
  - Timetable: 0 hard violations, soft penalty 3 on the public data (optimal in ~20s with 8 threads; only ~201 after 30s on 1 thread).
  - Exams: all 41 placed, 0 violations, 0 same-day penalty (~7s).
  - Spectra week: booking score 67/70, 0 priority inversions. BR-09 is impossible (1,200 people, biggest venue seats 800); BR-17 asks for P13–14, so it gets an alternative.
  - Sample disruption: 13–14 sessions moved (exactly the ones hit by CR-102 closing and F07's Mondays), 0 hard violations under the official validator.
  - Full pipeline export passes `validator.py` with 0 hard violations.
- Task 0 (Vercel check), Lane B (API + AI) and Lane C (frontend) are not started.

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

**Not yet confirmed:** one full run of the whole suite after the last repair changes (two-phase repair, baseline-aware commitments) was still running when tokens ran out. Next person: run it first:
```
.venv/bin/python -m pytest backend/tests/engine -q            # ~20 min with slow tests
.venv/bin/python -m pytest backend/tests/engine -q -m "not slow"   # quicker
.venv/bin/python backend/tests/engine/bench_engine.py         # timings (not run yet)
```
Known minor gaps (not fixed): basket sessions of different durations are modelled slightly stricter than the validator; `Decision.displaces` of an earlier event can go stale after a later displacement re-solve (overrides themselves are correct).

## Next steps
1. Task 0: Vercel project + Neon + Gemini key, deploy the health check. **Measure CP-SAT on Vercel's CPU** — quality depends on cores; raise `SOLVER_TIME_LIMIT_S` if only 1 core.
2. Lane B (API + AI) and Lane C (frontend) per docs/PLAN.md.

## Before you start
```
git pull origin main
python3.13 -m venv .venv && .venv/bin/pip install ortools pytest
.venv/bin/python -m pytest backend/tests/engine -q   # ~6 min, solver-heavy
```
Read PROJECT_CONTEXT.md, this file, and `starter_pack/README.md`.
