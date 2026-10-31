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
Proposed, not yet confirmed by the team:
- Backend: Python + FastAPI, Google OR-Tools CP-SAT for timetable / exams / repair
- Frontend: Next.js + TypeScript + Tailwind + shadcn/ui
- DB: Postgres (Supabase or Neon)
- Deploy: Vercel (frontend), Render/Railway (backend)
- LLM: one provider, for parsing and explanations only

## Architecture
TBD.

## Folder structure
See README.md. `starter_pack/` is organiser material and must not be modified.

## Database schema
TBD.

## API routes
TBD.

## Authentication
TBD.

## Dependencies
None yet.

## Environment variables
None yet (see `.env.example`).

## Completed features
- Repo set up, starter pack committed.

## Pending features
All of items 1–10 above, plus deployment, demo accounts, exports/, video.

## Known bugs
None yet.
