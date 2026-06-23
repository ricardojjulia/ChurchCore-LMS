---
name: council-review
description: Runs the 4-agent council sprint review for ChurchCore LMS. Spawns all four audit agents, collects their reports, synthesizes findings into ADRs and implementation prompts, and saves all outputs to docs/reviews/. Use at the end of every major sprint or before planning the next one. Triggers on: "run council review", "run the council", "sprint review", "council audit", "what should we work on next".
---

## When to Run

- After merging a significant feature branch
- Before planning the next sprint
- When the product backlog needs reprioritization
- After any production incident or user feedback cycle
- Minimum: once every two weeks of active development

## Step 1 — Spawn All Four Agents in Parallel

Delegate to all four council agents simultaneously. Do not wait for one before starting the others.

**@council-state-audit**: "Run a full LMS state audit of ChurchCore LMS at `/Users/rjulia/ChurchCore LMS`. Report on migrations, RLS coverage, API routes, page stubs, and seed data. Cite specific file paths everywhere."

**@council-route-audit**: "Run a route and page audit of ChurchCore LMS at `/Users/rjulia/ChurchCore LMS`. Read every shell and nav component, check page existence for every href, flag orphaned API calls, and produce a summary table with EXISTS/STUB/MISSING status for every route."

**@council-ux-audit**: "Run a UX and shell quality audit of ChurchCore LMS at `/Users/rjulia/ChurchCore LMS`. Check ARIA correctness, loading/empty states, CSS completeness, nav active state, error handling, and mobile responsiveness. Name specific pages and file paths for every finding."

**@council-feature-audit**: "Run a feature completeness and competitive audit of ChurchCore LMS at `/Users/rjulia/ChurchCore LMS`. Score each user type (0–100%), rate each core LMS workflow (Not Started/Partial/Complete), identify the 5 most critical competitive gaps, and produce an MVP readiness score with justification."

Wait for all four reports to arrive before continuing to Step 2.

## Step 2 — Cross-Agent Consensus

List every finding that two or more agents independently flagged. These have the highest confidence and are the top priorities.

Format:
```
### Consensus Finding: [short title]
Flagged by: Agent 1 (state), Agent 3 (UX)
Finding: [what both agents said]
Priority: CRITICAL / HIGH / MEDIUM
```

## Step 3 — ADR Drafts

For every architectural decision the council identifies, draft an ADR.

ADR triggers:
- A new module boundary or pattern (e.g., how error.tsx layers are structured)
- A new role-based access constraint
- A new integration contract (third-party service, edge function)
- A new data exposure rule

Follow the format in `docs/decisions/`. Assign the next sequential number.

Draft the ADR inline in the synthesis document. It will be committed separately after review.

## Step 4 — Implementation Prompts

For every agreed-upon change, write a concrete implementation prompt using this template:

```
## Prompt [LETTER] — [SHORT TITLE]

**ADR Reference:** ADR-XXXX (if applicable)
**Files:** [comma-separated list of files to create or modify]
**Scope:** [1–3 sentences describing exactly what to build — self-contained enough that a coder reading only this prompt knows what to do]

**Work:**
1. [Specific step]
2. [Specific step]

**Security:** [What auth check, RLS policy, or tenant isolation rule applies — required for any prompt touching auth, billing, or student records]

**Verification:**
- npm run typecheck
- npm test
- npm run lint
- [Any additional checks specific to this change]
```

Each prompt must be fully self-contained. Do not write "see above" or reference other prompts for context.

## Step 5 — Execution Order

List prompts in dependency order:
- Which prompts are independent (can run in parallel)?
- Which must wait for another to finish first?
- Which prompts touch the same files and must be sequential?

## Step 6 — Save Outputs

Create the following files (use today's date and an incrementing review number):

- `docs/reviews/YYYY-MM-DD-council-review-[N]-synthesis.md` — full synthesis: consensus findings, ADR drafts, implementation prompts, execution order
- `docs/reviews/YYYY-MM-DD-council-review-[N]-agent-1-state.md` — Agent 1 report verbatim
- `docs/reviews/YYYY-MM-DD-council-review-[N]-agent-2-routes.md` — Agent 2 report verbatim
- `docs/reviews/YYYY-MM-DD-council-review-[N]-agent-3-ux.md` — Agent 3 report verbatim
- `docs/reviews/YYYY-MM-DD-council-review-[N]-agent-4-features.md` — Agent 4 report verbatim

If new ADRs were drafted, also create:
- `docs/decisions/ADR-YYYY-NNN.md` — one file per ADR

After saving, report the file paths to the user so they can review and commit.

---

## Council Quality Rules

- Agents read only — they do not edit code. Never delegate an edit to an audit agent.
- Agents must cite specific file paths and line numbers where possible.
- The synthesis must not add scope beyond what agents identified — no wishlist features.
- Implementation prompts must be self-contained — a developer reading only the prompt must know exactly what to build.
- Every prompt touching auth, tenant isolation, billing, or student records must explicitly state the required security check.
- ADRs must be committed before the corresponding implementation begins.
- Do not skip saving the output files — the review is only useful if it's on disk.
