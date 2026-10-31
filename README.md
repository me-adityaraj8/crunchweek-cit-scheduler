# CIT Campus Scheduler — Crunch Week

Timetable generation, midsem exam scheduling, Spectra-week venue booking and disruption handling for Chilika Institute of Technology.

> Work in progress. Setup steps, architecture diagram, demo accounts, live link and known limitations will be filled in as they exist.

## Repo layout

```
starter_pack/          organisers' starter pack (dataset, validator, examples) — do not edit
exports/               schedule.json and schedule_after.json produced by the app (later)
PROJECT_CONTEXT.md     shared project knowledge
TASK_LOG.md            log of significant work
HANDOFF.md             current state for whoever picks up next
AI_USAGE.md            AI declaration (required)
THIRD_PARTY.md         third-party libraries (required)
```

## Validator

```
python starter_pack/validator.py --data starter_pack/data/cit_public.json --schedule exports/schedule.json
```
