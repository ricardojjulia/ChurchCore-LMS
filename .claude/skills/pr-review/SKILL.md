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
6. Once the PR is open (this step needs a real PR number, so it runs after the PR exists — before or interleaved with 2-5 is fine, but it must complete before merge): query external review threads via all three comment surfaces, since no single endpoint covers them all —
   - `gh api repos/:owner/:repo/pulls/<pr_number>/comments` — inline, line-bound review comments
   - `gh api repos/:owner/:repo/pulls/<pr_number>/reviews` — review-level summaries (this is usually where an automated reviewer's overall assessment lives, e.g. GitHub Copilot's)
   - `gh api repos/:owner/:repo/issues/<pr_number>/comments` — general PR-level discussion (PRs are issues in GitHub's API)

   CodeQL findings aren't PR comments — they're check-run annotations: `gh api repos/:owner/:repo/commits/<sha>/check-runs` or `gh run list`.

   Triage every finding across all of these by category (security, RLS policies, schemas, accessibility, assertion strictness). Resolve actionable feedback directly on the branch, then re-run `npm run verify` (typecheck + lint + unit tests) and confirm a clean result before merging.

## Rules

- `pr-reviewer` never edits, merges, approves, or closes anything.
- If this PR already went through `build-feature`/`run-factory` and has an `implementation-validator` report, pass that report to `@pr-reviewer` as context so it doesn't redo the acceptance-criteria pass — it should focus on diff hygiene and anything outside the story's original scope instead.
- Do not skip this gate because the change "looks small" — that's exactly the case `implementation-validator` never sees.
- Do not skip step 6 because `@pr-reviewer` came back clean — it reviews the diff, not the PR's comment thread. A Copilot or CodeQL comment can surface something the diff-only pass has no way to catch (e.g. a runtime-only accessibility issue or a schema mismatch visible only in CI's generated types).
- A comment that isn't actionable (stylistic preference already covered by lint/CLAUDE.md convention, a false positive, something out of scope for this PR) doesn't need a code change — but note why it was dismissed rather than silently ignoring it, so the next reviewer doesn't re-raise it.
