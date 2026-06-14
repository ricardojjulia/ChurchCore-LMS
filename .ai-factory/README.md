# AI Factory — ChurchCore LMS

The factory orchestrates multi-agent development runs: plan → implement → test → review.
Each run is tracked in `.ai-factory/runs/<run-id>/` with full state, prompts, and outputs.

## Commands

```bash
# Start a new run (creates run dir, auto-runs plan phase)
npm run factory run "Add gradebook feature"

# Run a specific phase on an existing run
npm run factory plan      <run-id>
npm run factory implement <run-id>
npm run factory test      <run-id>
npm run factory review    <run-id>

# Check all run statuses
npm run factory status

# Dry-run (writes prompts without calling agents)
npm run factory run "Fix enrollment bug" --dry-run
```

## Phase → Agent mapping

| Phase      | Agent config key | Claude CLI call          |
|------------|-----------------|--------------------------|
| plan       | planner         | `claude --print`         |
| implement  | implementer     | `claude --print`         |
| test       | tester          | `claude --print`         |
| review     | planner         | `claude --print`         |

## Run folder anatomy

```
.ai-factory/runs/<run-id>/
  state.json                  — current phase state
  request.md                  — original task request
  codex-plan-prompt.md        — assembled plan prompt
  plan.md                     — planner output
  claude-implementation-prompt.md
  implementation-summary.md   — implementer output
  gemini-test-prompt.md
  test-report.md              — tester output
  codex-review-prompt.md
  review.md                   — reviewer output
```

## Rules loaded into every prompt

- `rules/engineering.md`  — code quality, patterns, conventions
- `rules/architecture.md` — system topology, boundary rules
- `rules/testing.md`      — test strategy and gates
- `rules/security.md`     — RLS-first, threat model standards
