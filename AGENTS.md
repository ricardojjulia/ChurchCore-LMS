# ChurchCore LMS — Required Agent Operating Instructions

Read this file and `CLAUDE.md` in full before taking any action. Read
`docs/CODE-FACTORY-SYSTEM-PROMPT.md` before planning or implementing a
significant change. These instructions are mandatory for every task in this
repository.

## Scope and preservation

- This repository is **ChurchCore LMS** only. `/Users/rjulia/ChurchCore Academy`
  and every other repository are out of scope unless the user explicitly names
  and authorizes them.
- At startup, verify the checkout path, branch, remotes, `origin/main`, worktree
  state, package manager, environment-variable names, and active factory
  progress/state records.
- Preserve every existing user change, untracked artifact, worktree, local
  Supabase stack, cloud database, and deployment unless the user explicitly
  authorizes the exact mutation. Use a clean worktree for verification or edits
  when the primary checkout is dirty.
- Never put secrets, service-role keys, PII, test passwords, raw provider
  payloads, or credentials in source, logs, commits, browser input, or reports.

## Factory and security gates

- Continue the approved plan in `.ai-factory/runs/` before inventing a roadmap.
  When the approved plan is complete, run the documented council process before
  implementing a new significant feature or governance change.
- Treat RLS, tenant boundaries, server/client separation, input validation,
  provenance guards, migrations, and sensitive-data exposure as release gates.
  Do not use `SET row_security = off`, expose service clients to browser code, or
  bypass authentication/tenant checks.
- Run real verification appropriate to the change: lint, typecheck, unit tests,
  build, version check, audit, database lint/tests, E2E, concurrency checks, and
  browser smoke where safely available. Do not claim a dry run, stale shared
  database, or an agent exit status is test proof. Never reset a shared or hosted
  database; record an environment mismatch instead.

## GitHub delivery and signing

- Before commit, review the exact diff and verify version/changelog consistency.
  Commit only scoped, verified LMS work and push only the intended LMS branch.
- Main requires resolved conversations and verified signatures. Sign every LMS
  commit with SSH signing. This Mac uses
  `/Users/rjulia/.ssh/id_ed25519_churchcore_lms_github_signing.pub` and GitHub
  noreply author email `32270383+ricardojjulia@users.noreply.github.com`.
  Confirm locally with `git log --show-signature` and on GitHub with a valid PR
  commit signature before merge.
- Inspect live branch-protection policy and every PR review thread/check before
  merging. Resolve comments with a substantive response and rerun affected
  checks. Even if a check is not configured as required, wait for it when the
  user asks for a fully verified merge. Do not assume administrator privileges
  bypass signature or conversation gates.
- A production deployment requires separate explicit authorization. Merging a
  PR does not authorize database migration, deploy-hook invocation, release
  approval, or Academy work.
