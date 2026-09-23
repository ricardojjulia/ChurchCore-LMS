# GitHub Branch Protection & Repository Setup

## Branch: `main`

Configure in **GitHub → Repository → Settings → Branches → Branch protection rules**.

| Setting | Value |
|---|---|
| Require a pull request before merging | **YES** |
| Required approving reviews | **1** minimum |
| Dismiss stale pull request approvals when new commits are pushed | **YES** |
| Require status checks to pass before merging | **YES** |
| Required status checks | `Lint`, `Type Check`, `Unit Tests`, `Build` |
| Require branches to be up to date before merging | **YES** |
| Restrict who can push to matching branches | Admins only |
| Allow force pushes | **NO** |
| Allow deletions | **NO** |

## Production Environment (release approval and deployment credentials)

Configure in **GitHub → Repository → Settings → Environments → New environment**.

- Name: `production`
- Required reviewers: add the architects team or specific individuals
- Deployment branches: `main` only

The production deployment job itself references this environment, so its required reviewers
and environment secrets apply to the job that deploys migrations and functions. Configure reviewers
before enabling release promotion; an environment name alone does not create an approval gate.

## Required Secrets

Configure in **GitHub → Repository → Settings → Secrets and variables → Actions**.

| Secret | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (build-time) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (build-time) |
| `DEPLOY_WEBHOOK_URL` | Slack/Discord webhook URL (optional — skipped if missing) |

The E2E workflow starts an isolated local Supabase stack in its GitHub-hosted runner and generates a disposable password at runtime. It does not require repository secrets or access to a shared cloud database.

The E2E workflow starts an isolated local Supabase stack in its GitHub-hosted runner and generates a disposable password at runtime. It does not require repository secrets or access to a shared cloud database.

## Release Environment

There is no staging environment (see [ADR-2026-011](decisions/ADR-2026-011.md)).
Releases go from CI straight to the `production` GitHub environment, whose
required-reviewer approval is the gate before any production migration or deploy.

### GitHub environment

In **GitHub → Settings → Environments**, the `production` environment must have:

- Required reviewers (the approval gate — the environment name alone is not a gate)
- Deployment branches: `main` only

### Deployment secrets

Configure these under **Settings → Environments → production → Environment secrets**.

| Environment | Secret | Purpose |
|---|---|---|
| `production` | `SUPABASE_PROJECT_REF` | Production project reference |
| `production` | `SUPABASE_ACCESS_TOKEN` | Supabase personal access token with access to the production project |
| `production` | `VERCEL_DEPLOY_HOOK_URL` | Secret URL for the ChurchCore LMS `main` production deploy hook |

A project URL supplies the reference (the part before `.supabase.co`), but does not
provide deployment authorization. Use a personal access token from an account with
access to the target project. An anon, publishable, secret API, or service-role key
is not a Management API personal access token. Keep token values out of issues,
chat, and workflow files. Environment-scoped tokens can differ between projects;
repository secrets remain a fallback when the same account can access both.

The release checks required variable names before installing the CLI or invoking
Supabase and reports every missing setting without printing its value. Project
references are quoted shell arguments; the release pins Supabase CLI `2.116.0`,
links each project with `supabase link --project-ref`, then runs
`db push --linked` so the connection uses the IPv4-compatible pooler (GitHub-hosted
runners cannot reach the IPv6-only direct endpoint). The access token is
provided only to validation and Supabase deployment steps; checkout, CLI setup,
and notification steps do not inherit it.

The reviewed production project reference is also pinned as a non-secret
workflow constant. A `SUPABASE_PROJECT_REF` secret that does not match it stops
before any migration. Changing the project assignment requires a reviewed
workflow change as well as updating the environment secret.

For this pinned CLI, the token-based database connection obtains a temporary
login role when no database password is supplied. This release therefore does
not require a separate database-password secret. The token needs permission to
create that login role and access the project's pooler configuration, in addition
to the required deployment access. An authorization failure in that flow must be
resolved before deployment; successful secret creation alone does not prove access.
See the [2.116.0 database connection implementation](https://github.com/supabase/cli/blob/v2.116.0/apps/cli/src/legacy/shared/legacy-db-config.layer.ts#L102-L117).

The pinned CLI also accepts multiple function names, so the release deploys only
`search-users` and `weekly-digest`; it does not implicitly deploy every local
function. See the [2.116.0 function argument definition](https://github.com/supabase/cli/blob/v2.116.0/apps/cli/src/legacy/commands/functions/deploy/deploy.command.ts#L11-L15).

### Recovery from a failed release

1. Verify the production `SUPABASE_ACCESS_TOKEN` is a personal access token
   (`sbp_…`, from supabase.com/dashboard/account/tokens) whose account is an
   Owner or Administrator of the production project. `Unauthorized` means the
   token is invalid or expired; `Missing required permission(s)` means the
   account's role on the project is too low.
2. Re-run the failed release in GitHub Actions. Missing configuration and permission
   failures must remain failed; do not replace required secrets with placeholders
   or skip deployment steps to obtain a green result.
3. Approve the production deployment. Confirm the production migration runs before
   the Edge Functions deploy and that the release waits for Vercel production success.

References: [Supabase environment deployment](https://supabase.com/docs/guides/deployment/managing-environments),
[GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

### Pipeline order

After this setup, `release.yml` serializes releases and enforces: **CI → production environment approval → latest-main check → production migration/functions → Vercel production deployment/verification**. Automatic Git deployment from `main` is disabled in `vercel.json`; pull-request preview deployments remain enabled. A failed migration, stale release, or failed Vercel deployment blocks success notification.

---

## CODEOWNERS

`/.github/CODEOWNERS` requires architect review for:
- `/supabase/migrations/` — schema changes
- `/supabase/functions/` — edge function changes
- `/.github/workflows/` — CI/CD pipeline changes
- `/src/utils/supabase/` — Supabase client configuration

## Status Check Requirements

The following checks must all pass before a PR can be merged:

1. **Lint** — `npm run lint`
2. **Type Check** — `npm run typecheck`
3. **Unit Tests** — `npm run test:ci`
4. **Build** — `npm run build`

E2E tests run separately on PRs to `main` using an isolated local Supabase stack. Add `E2E Tests` to the required status checks after its first successful run.
