---
name: pr-review
description: Mandatory pre-merge review gate for ChurchCore LMS — runs on every PR, non-trivial or not, in addition to (not instead of) council-review/build-feature's own Gate 3 validation. Use before merging, before opening a PR, or when asked to review a diff.
---

# PR Review

## When to run

Every PR before merge. This is separate from `council-review` (periodic sprint audit) and `build-feature`/`run-factory`'s own Gate 3 (`implementation-validator`, which only runs inside that pipeline). A one-line fix or small change that skipped the full factory pipeline still goes through this gate — it's the floor, not the ceiling.

## Chain

1. Read `CLAUDE.md` and the current diff.
2. Invoke `@pr-reviewer` (read-only) against the diff.
3. Findings come back ranked Critical / Important / Minor.
4. Critical or Important findings block merge — fix, then re-run this gate.
5. Minor findings are the author's call; note them in the PR description either way.

## Rules

- `pr-reviewer` never edits, merges, approves, or closes anything.
- If this PR already went through `build-feature`/`run-factory` and has an `implementation-validator` report, pass that report to `@pr-reviewer` as context so it doesn't redo the acceptance-criteria pass — it should focus on diff hygiene and anything outside the story's original scope instead.
- Do not skip this gate because the change "looks small" — that's exactly the case `implementation-validator` never sees.
