# AI Usage

## Models / APIs called by the product

| Model | Called from | Used for |
| --- | --- | --- |
| Google Gemini 3.5 Flash-Lite (`GEMINI_MODEL`), JSON-schema output | `backend/app/llm/client.py` | Turning plain English/Hinglish venue requests into booking form fields (`parse_booking.py`); turning faculty/coordinator chat into a change request (`parse_change.py`); rewording reasons the code already computed into plain sentences (`reword.py`, only when the user asks); sorting a Velo message into an intent when the keyword rules can't (`llm/velo.py`, prompt `prompts/velo.md`); transcribing voice input from the mic button (`transcribe()`, prompt `prompts/transcribe.md`). The transcript only fills the message box: the person reads it and sends it like typed text |
| Groq, `openai/gpt-oss-120b` (`GROQ_MODEL`), through Groq's OpenAI-compatible chat API with tool calling | `backend/app/llm/chat.py`, run by `backend/app/services/velo_agent.py` | Velo, the in-app assistant: reads the message, asks follow-up questions, and calls the typed tools in `backend/app/services/velo_tools.py` (look up timetables, free rooms, reasons, pending approvals; draft a booking, a cancellation, a change request or an approval). `LLM_PROVIDER` picks Groq or Gemini (Gemini's OpenAI-compatible endpoint, same `GEMINI_MODEL`); the other one is tried if the first fails |

If a key is missing, a call fails, times out (`LLM_TIMEOUT_S`, `AGENT_TIMEOUT_S`) or returns anything but valid JSON, the app uses keyword rules instead (`parse_booking.py`, `parse_change.py`, and Velo's keyword router in `backend/app/services/velo.py`) and tells the user. The manual booking form never needs the LLM.

## AI tools used to build the project

- Claude Code (Anthropic): repo setup and docs; the engine (`backend/app/core`, `backend/app/solver`) and its tests; the API, services, LLM layer and API tests (`backend/app/*.py`, `routers/`, `services/`, `llm/`, `backend/tests/api`), deployment config and the scripts (`scripts/make_exports.py`, `eval_llm.py`, `eval_velo.py`); design and build plan in `docs/`; the web frontend (`frontend/`): design research, the visual design system in `frontend/DESIGN.md`, every page and component, and the frontend tests.

## Where prompts are kept

Every instruction sent to a model is a file in `backend/app/llm/prompts/`: `booking.md` (booking form fields), `change.md` (change requests), `reword.md` (rewording computed reasons), `transcribe.md` (voice), `velo.md` (intent sorting) and `velo_agent.md` (Velo's rules). At run time Velo's system prompt is filled in with the person's role, the page they are on, today's date and time in IST with what "tomorrow" means (`day_context()` in `backend/app/llm/timeparse.py`), and a code-built summary of the conversation (`system_prompt()` in `backend/app/services/velo_agent.py`). Each tool's description and argument schema come from its definition in `backend/app/services/velo_tools.py`. Room, group and course lists are passed in as data on each call, never written into the prompts.

## How the assistant is tested

- `scripts/eval_llm.py` runs the cases in `backend/tests/api/llm_cases.json` through the form-filling parser: the dataset's own request texts, the public samples, and our tricky set (priority abuse, prompt injection, vague times, conditions, Hinglish). The run fails if any draft claims a category above the role's cap or carries a status.
- `scripts/eval_velo.py` puts Velo through 22 judge-style requests (relative days on a weekend, calendar dates, Devanagari, too many people, conditions, priority abuse, self-approval, prompt and JSON injection, follow-ups, faculty leave) and checks the tools it called, the cards it prepared and its reply. It runs on the configured model, or on the keyword fallback when no key is set.
- Offline tests with a fake model: `backend/tests/api/test_llm.py`, `test_velo_agent.py` (the agent loop), `test_velo_fallback.py` (Velo with no model) and `test_relative_days.py` (dates and the prompt's "now" line).

## What the LLM is not allowed to decide

Whether any timetable, exam slot, booking or change is valid, approved or rejected. The LLM only extracts fields, asks questions and picks which tool to call. After it, code (not the prompt):

- caps the event category by the user's role;
- works out "today", "tomorrow", "kal", "parso" and calendar dates ("4th November") from the real date in IST, and refuses weekend days;
- turns times into periods using the calendar, and reads Devanagari as Hinglish before the keyword rules run;
- drops a named room that lacks a requested need and says so;
- asks which day and time when they are missing; a booking can't be sent without a head count, and Velo asks for one;
- offers each Velo tool only to the roles allowed to use it.

Nothing Velo prepares changes data on its own: a booking, cancellation, change request or approval is shown as a card the person confirms, and on confirm it runs through the same services as the forms, which check it again against the timetable active at that moment. Every booking and change goes through `backend/app/core/checker.py` and the solvers. The LLM output schemas have no status or approval field.
