---
name: build-feature
description: Full feature build workflow for ChurchCore LMS. Runs explore → story → spec → backend → frontend → tests → validate in sequence with human approval gates. Use when asked to build, implement, add, or extend a feature. Triggers on: "build the feature", "implement", "add feature", "build [feature name]", "ship [feature name]".
---

## Process

Read `CLAUDE.md` before starting. All rules there are mandatory throughout this skill.

### Step 0 — Explore First (required)
Delegate to `@codebase-researcher`: "How does [feature area] work today? Map the relevant files, patterns, and risks."

Wait for findings. Do not proceed until you have the map.

### Step 1 — Write the Story
Delegate to `@story-writer` with:
- The rough feature description
- The researcher's findings

Present the story and acceptance criteria to the user.
**Human gate:** User must approve the story before continuing. Do not skip this gate.

### Step 2 — Write the Spec
Delegate to `@spec-writer` with:
- The approved story
- The researcher's findings

Present the spec to the user.
**Human gate:** User must approve the spec before any code is written. Do not skip this gate.

### Step 3 — Build Backend
Delegate to `@backend-builder` with:
- The approved spec
- Researcher findings (relevant existing patterns)

After the backend-builder reports complete:
- Confirm `npm run typecheck` passes
- Confirm `npm test` passes

### Step 4 — Build Frontend
Delegate to `@frontend-builder` with:
- The approved spec
- Backend-builder's output summary

After the frontend-builder reports complete:
- Confirm `npm run typecheck` passes
- Confirm `npm run lint` passes

### Step 5 — Verify Tests
Delegate to `@test-verifier` with:
- The approved story (acceptance criteria)
- Files created in steps 3 and 4

Confirm all criteria are covered. If any are missing, fix before continuing.

### Step 6 — Validate
Delegate to `@implementation-validator` with:
- The approved story
- The approved spec
- All files created

Present the validation report to the user.
**Human gate:** User reviews the report. If any CRITICAL or HIGH findings exist, fix them before creating a PR.

### Step 7 — Summary
Return:
- Files created or modified
- Migration files created
- Tests added
- Any env vars needed
- Council document created? (if this feature required a council review first)

---

## Rules

- Never skip the human approval gates at Steps 1, 2, and 6
- Never start Step 3 before the spec is approved
- Every feature touching auth, tenant isolation, or student records must state the security check explicitly
- If the feature requires a new DB table or schema change, a council document should be written first — remind the user if one doesn't exist
- Do not refactor unrelated code during this workflow
