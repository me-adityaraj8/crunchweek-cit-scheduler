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
- `core.dataset`: `load_dataset(path|dict)`, `apply_changes(ds, change_file)` → raises `DatasetError` with a readable message.
- `solver.timetable.solve_timetable(ds, time_limit_s, ...)` → `SolveResult(status, assign, soft, soft_total, solve_ms)`
- `solver.exams.solve_exams(ds, time_limit_s)` → `ExamResult(status, exams, penalty)`
- `solver.fest.decide_fest(ds, assign, extra_requests=[])` → `FestResult(decisions, overrides)`
- `solver.repair.repair(ds_after, baseline, fest, time_limit_s, extra_requests=[])` → `RepairResult(status, assign, diff, moved, time_changed, room_only, soft_before, soft_after, conflicts, fest)`.
  - Spectra bookings are decided again on the repaired timetable. **Export `RepairResult.fest` in schedule_after**, not the old FestResult.
  - Bookings whose decision changed come back as conflicts with code `booking_changed`. Show them in the diff view.
  - Live app bookings never displace classes (only dataset institute events do). Mint `APP-` ids so they never collide with dataset ids.
- `core.checker`: `check_timetable`, `check_move`, `check_booking`, `free_rooms`, `check_fest` (returns violations, warnings, stats), `check_exams`, `full_report`
- `core.explain`: `explain_session(ds, assign, sid)`, `explain_booking(ds, fest, request_id)`
- `core.export.build_schedule(ds, assign, fest, exams, team)`

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
