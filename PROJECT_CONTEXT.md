# Project Context

## Overview
Web platform for Chilika Institute of Technology (CIT): generate a clash-free weekly timetable, schedule midsems, take venue requests in English/Hinglish, decide Spectra-week (Week 7) bookings by priority, and repair the timetable after disruptions with Admin approval.

Full brief: `Problem statement.pdf`. Data + export format: `starter_pack/README.md`.

## Problem statement (short)
1. Clash-free timetable for all 189 sessions.
2. Midsem exams (41) for the next week (MON–SAT, AM/PM, rooms at half capacity).
3. Plain-language (English/Hinglish) venue requests → editable structured booking.
4. Approve / reject / offer alternative for the 25 Spectra requests using priority rules, with reasons.
5. Disruptions (faculty leave, room closed, session added/removed): minimal-move repair, diff view, Admin approval, explain infeasibility.
6. Views by group / faculty / room + pending approvals, conflicts, room utilisation.
7. AI assistant for faculty change requests — every AI output validated by our code.
8. Explain decisions on request.
9. Admin loads dataset + change files; export `schedule.json`.
10. Manual scheduling by authorised roles, hard constraints enforced.

## Scoring that matters most
- Scheduling correctness 25 (−3 per hard violation, run with official `validator.py`)
- Rescheduling 15, Use of AI 15, Optimisation 10, Booking decisions 10, Usability 10, UI 10, Code/docs 5
- LLM may parse/explain only; validity must be decided by our code. Manual booking form must work with LLM down.

## Roles
Admin, Department coordinator, Faculty, Club representative. Nobody approves their own request. Demo accounts for all four + Admin "reset demo data" button.

## Technology stack
See docs/DESIGN.md section 3.2 for reasons. Summary:
- Backend: Python + FastAPI, Google OR-Tools CP-SAT for timetable / exams / repair
- Frontend: React 19 + Vite 7 + TypeScript + Tailwind 4 + shadcn/ui-style components on Radix, TanStack Query, Motion. Design system and research in `frontend/DESIGN.md`
- DB: Postgres on Neon
- Deploy: Vercel for both (Python function under /api); Render as fallback
- LLM: Gemini 3.5 Flash-Lite, for parsing and wording explanations only

## Architecture
Modular monolith. See docs/DESIGN.md (diagram, data model, API, folder structure).

## Folder structure
See README.md. `starter_pack/` is organiser material and must not be modified.

## Database schema
SQLAlchemy models in `backend/app/models.py`, created at startup (no migrations). Scheduling state is JSON next to the row it belongs to:
- `users`: demo accounts (email, role admin/coordinator/faculty/club, department, faculty_id, bcrypt hash)
- `datasets`: starter-pack JSON with changes applied, `applied_changes`, `parent_id`, one `active`
- `timetable_versions`: `assignments` {session: [day, start, room]}, `fest` {decisions, overrides, cache}, soft, kind generated/change/manual, status active/archived
- `exam_schedules`, `booking_requests` (app requests `APP-0001`…, dataset shape in `data`, status, decision, approver, confirmed placement)
- `change_proposals` (payload change file or manual move, proposed assignment, diff, counts, conflicts, status pending/approved/rejected/infeasible)
- `audit_log`, `settings` (priority_order, lab_owners)

## API routes
All under `/api`; table in README.md, live docs at `/api/docs`. Response shapes in `backend/app/schemas.py`.

## Authentication
Seeded demo accounts (README), password from `DEMO_PASSWORD`, bcrypt. `POST /api/auth/login` returns a 12h HS256 JWT (`JWT_SECRET`); send `Authorization: Bearer`. Role guards in `backend/app/auth.py`; "not your own request" checks in the services.

## Dependencies
`requirements.txt` (runtime, pinned) and `requirements-dev.txt` (+ pytest). Licences in THIRD_PARTY.md.

## Environment variables
`DATABASE_URL`, `JWT_SECRET`, `DEMO_PASSWORD`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `LLM_TIMEOUT_S`, `SOLVER_TIME_LIMIT_S`, `SOLVER_WORKERS`, `TEAM_NAME`. Meanings and defaults in `.env.example`; read in `backend/app/config.py`.

## Completed features
- Repo set up, starter pack committed.
- Frontend (Lane C): every page for the four roles (overview, timetable with explanations and manual-move proposals, find a room, booking assistant with live checks, Spectra week board, changes with before/after diff and approval, approvals, exams, data and export, settings), light and dark themes, phone layout. Built against the real API types (`frontend/src/api/schema.d.ts`). 18 unit tests.
- API + AI (Lane B): auth and roles, dataset upload/reset, timetable generate/views/manual moves/explain, dashboard, free rooms, exams, Spectra bookings (check, submit, cancel, lab approvals), change proposals with approval and stale/self-approval guards, Gemini assistant with keyword fallback, export, `scripts/make_exports.py`. 44 API tests.
- Engine (Lane A): dataset loading + change files, checker that matches validator.py, CP-SAT timetable, exam scheduler, Spectra week decisions, export, minimal-move repair with infeasibility reasons, explanations. Numbers in HANDOFF.md.

## Pending features
Deployment + hosting check (Task 0; size numbers in HANDOFF), `exports/` from the deployed app, a Gemini run of `scripts/eval_llm.py` (needs a key), video.

## Known bugs
- Approving a change re-decides Spectra week only when app requests changed since the proposal; otherwise it reuses the repair's decisions. If displacement re-solves are needed, approval can take tens of seconds.
- Two engine QA tests are timing-sensitive on slower machines (see HANDOFF).
