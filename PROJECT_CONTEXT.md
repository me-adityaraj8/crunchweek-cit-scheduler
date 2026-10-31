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
- Frontend: React + Vite + TypeScript + Tailwind + shadcn/ui
- DB: Postgres on Neon
- Deploy: Vercel for both (Python function under /api); Render as fallback
- LLM: Gemini 2.5 Flash, for parsing and wording explanations only

## Architecture
Modular monolith. See docs/DESIGN.md (diagram, data model, API, folder structure).

## Folder structure
See README.md. `starter_pack/` is organiser material and must not be modified.

## Database schema
TBD.

## API routes
TBD.

## Authentication
TBD.

## Dependencies
- ortools 9.15.6755, pytest (engine). Full pinned list comes with Task 0's requirements.txt.

## Environment variables
None yet (see `.env.example`).

## Completed features
- Repo set up, starter pack committed.
- Engine (Lane A): dataset loading + change files, checker that matches validator.py, CP-SAT timetable, exam scheduler, Spectra week decisions, export, minimal-move repair with infeasibility reasons, explanations. Numbers in HANDOFF.md.

## Pending features
API, auth and roles, LLM assistant, frontend, deployment, demo accounts, exports/, video (Task 0, Lanes B and C in docs/PLAN.md).

## Known bugs
None yet.
