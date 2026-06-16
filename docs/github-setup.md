# GitHub Branch Protection & Repository Setup

## Branch: `main`

Configure in **GitHub → Repository → Settings → Branches → Branch protection rules**.

| Setting | Value |
|---|---|
| Require a pull request before merging | **YES** |
| Required approving reviews | **1** minimum |
| Dismiss stale pull request approvals when new commits are pushed | **YES** |
| Require status checks to pass before merging | **YES** |
| Required status checks | `lint`, `typecheck`, `unit-tests`, `build` |
| Require branches to be up to date before merging | **YES** |
| Restrict who can push to matching branches | Admins only |
| Allow force pushes | **NO** |
| Allow deletions | **NO** |

## Production Environment (for release.yml manual approval gate)

Configure in **GitHub → Repository → Settings → Environments → New environment**.

- Name: `production`
- Required reviewers: add the architects team or specific individuals
- Deployment branches: `main` only

## Required Secrets

Configure in **GitHub → Repository → Settings → Secrets and variables → Actions**.

| Secret | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (build-time) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (build-time) |
| `TEST_SUPABASE_URL` | Test project URL (e2e only) |
| `TEST_SUPABASE_ANON_KEY` | Test project anon key (e2e only) |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | Test project service role key (e2e seed only) |
| `TEST_DATABASE_URL` | Postgres connection string for test DB (e2e only) |
| `TEST_BASE_URL` | Base URL of the test deployment (e2e only) |
| `DEPLOY_WEBHOOK_URL` | Slack/Discord webhook URL (optional — skipped if missing) |

## CODEOWNERS

`/.github/CODEOWNERS` requires architect review for:
- `/supabase/migrations/` — schema changes
- `/supabase/functions/` — edge function changes
- `/.github/workflows/` — CI/CD pipeline changes
- `/src/utils/supabase/` — Supabase client configuration

## Status Check Requirements

The following checks must all pass before a PR can be merged:

1. **lint** — `npx next lint --max-warnings 0`
2. **typecheck** — `npx tsc --noEmit`
3. **unit-tests** — `npx vitest run --coverage`
4. **build** — `npx next build`

E2E tests run separately on PR to main and are a recommended (not required) check until the test infrastructure is fully provisioned.
