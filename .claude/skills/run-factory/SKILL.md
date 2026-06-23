---
name: run-factory
description: Orchestrates the full ChurchCore LMS software factory pipeline: research → story → spec → build → test → validate. The single entry point for building any new feature end-to-end with all agents chained. Triggers on: "run the factory", "factory build", "full pipeline for", "orchestrate the build of".
---

## What This Skill Does

Chains all seven specialist agents in sequence with human approval gates. You describe a feature once. The factory does the structured work. You approve at three gates before code is written, and review a validation report before the PR opens.

## Pre-Flight (always first)
1. Confirm: does this feature need a council document first? (New DB tables, new user roles, new integrations → yes.) If yes, stop and ask the user to run `/council-review` first.
2. Read `CLAUDE.md` — all rules are in effect for this entire pipeline.
3. Check `docs/reviews/` for the most recent council synthesis. If it contains a prompt that matches this feature request, use that prompt as the spec input — do not re-derive scope from scratch.

## Pipeline

```
[User: feature description]
         │
         ▼
  ① codebase-researcher
    Maps existing code, patterns, risks
         │
         ▼
  ② story-writer
    Produces user story + acceptance criteria
         │
    ◆ GATE 1: User approves story ◆
         │
         ▼
  ③ spec-writer
    Produces data model, API contract, test plan
         │
    ◆ GATE 2: User approves spec ◆
         │
         ├─────────────────────┐
         ▼                     ▼
  ④ backend-builder     ⑤ frontend-builder
    Migration, RLS,         Pages, components,
    API routes, lib         hooks, forms
         │                     │
         └──────────┬──────────┘
                    ▼
           ⑥ test-verifier
             Writes & runs acceptance tests
                    │
                    ▼
           ⑦ implementation-validator
             Compares vs story + spec
                    │
    ◆ GATE 3: User reviews validation report ◆
                    │
                    ▼
              PR-ready output
```

## At Each Gate

**Gate 1 (story approved):**
Present the story and acceptance criteria. Ask: "Does this story correctly describe what you want? Should any acceptance criterion be added or removed?" Only continue when user says yes.

**Gate 2 (spec approved):**
Present the spec. Ask: "Does the data model look right? Are the API contracts complete? Any missing edge cases?" Only continue when user says yes.

**Gate 3 (validation reviewed):**
Present the validator's report. If any CRITICAL findings: stop, fix, re-validate before PR. If HIGH findings: list them and ask the user whether to fix now or track in HQ tasks.

## After the Pipeline Completes
Return a PR summary including:
- Feature description (one sentence)
- Files created or modified
- Migration files (name + what they do)
- Tests added (count, type)
- Acceptance criteria: N/N passed
- Any known limitations or follow-on work

---

## Rules
- Never skip a gate — the factory's value is in the structured checkpoints
- Backend and frontend builders run in parallel after Gate 2 (both receive the same approved spec)
- If any builder hits a spec conflict with CLAUDE.md security rules, it stops and reports — do not override the rules to keep moving
- The validator never edits files — it reports only; the builder makes fixes
- Total pipeline time estimate: present this to the user upfront so they know what to expect
