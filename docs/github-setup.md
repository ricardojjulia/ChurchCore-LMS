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
| `DEPLOY_WEBHOOK_URL` | Slack/Discord webhook URL (optional — skipped if missing) |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI personal access token (release deploy) |
| `SUPABASE_PROJECT_REF` | Production Supabase project ref (release deploy) |

The E2E workflow starts an isolated local Supabase stack in its GitHub-hosted runner and generates a disposable password at runtime. It does not require repository secrets or access to a shared cloud database.

## Staging Environment

Create a dedicated second Supabase project for staging — never share schemas, always full project isolation.

### Supabase project

Create a second Supabase project named `churchcore-lms-staging` in the same organisation.

### GitHub environment

In **GitHub → Settings → Environments → New environment**:

- Name: `staging`
- No approval gate (auto-deploys on every push to `main`)
- Deployment branches: `main` only

### Required secrets (staging)

| Secret | Purpose |
|---|---|
| `STAGING_SUPABASE_PROJECT_REF` | Staging Supabase project ref (used by `deploy-staging` job) |

`SUPABASE_ACCESS_TOKEN` is shared between staging and production (same token, different project refs).

### Pipeline order

After this setup, `release.yml` enforces: **CI → staging deploy → manual production approval → production deploy**. A failed staging migration blocks the production gate automatically.

---

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

E2E tests run separately on PRs to `main` using an isolated local Supabase stack. Add `E2E Tests` to the required status checks after its first successful run.
