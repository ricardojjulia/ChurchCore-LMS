# Staging release configuration repair

## 2026-09-15T13:49:47+00:00

### Request and scope

Repair Release run 34959512844, whose staging migration step received an empty
`--project-ref`. User confirmed `gytbfezrfrpsltdyfdgj` as staging. Existing councils
COUNCIL-2025-017 and COUNCIL-2026-019 require separate staging and production
environments. No new product feature or data model is introduced.

### Completed

- Created an isolated LMS worktree from merged main `7f97f79`; existing checkouts
  and `.sync.ffs_db` are preserved.
- Configured `STAGING_SUPABASE_PROJECT_REF` in the GitHub staging environment.
- Added release preflight errors naming every missing setting without values.
- Bound credentials through job environment variables and quoted project refs.
- Pinned the verified Supabase CLI 2.116.0 and made staging push non-interactive.
- Moved the production environment reference to the actual deployment job,
  preserving the staging-before-production dependency and applying environment
  credentials and reviewer rules at the operation they protect.
- Added production migration deployment after approval and before production
  Edge Functions, preventing application/function rollout against stale schema.
- Amended M5 so localized OpenAPI 3 documents are the REST source of truth and
  Swagger UI is generated, authenticated operator tooling rather than a
  certification dependency. M3 signed CSV routes remain a separate contract.
- Updated release setup/recovery documentation and version/changelog to 0.26.1.

### Verification

- PASS: 221 unit tests in 29 files with existing coverage thresholds.
- PASS: typecheck, lint, version consistency and production build.
- PASS: actionlint 1.7.12 and 13 workflow checks executing the actual YAML
  shell steps with a local Supabase stub. Missing settings block all deployment
  calls; complete settings reach the expected commands; values stay out of
  output; shell-like input stays a single literal argument.
- PASS: final diff whitespace and review for credential exposure.
- No database, schema, application behavior or UI changes; E2E is left to the
  existing hosted PR gate. Deployment checks do not claim real cloud success.
- Existing npm dependency audit debt remains: 47 vulnerabilities (37 moderate,
  9 high, 1 critical); no dependencies were upgraded in this release fix.

### Required information

The saved CLI token can access the original LMS project but returns HTTP 403
for staging. User was asked to add a personal access token with staging access
as `SUPABASE_ACCESS_TOKEN` in the staging GitHub environment. No token value
was printed, committed, copied into chat, or reused against an unauthorized
project. No deployment retry occurred. Production reviewers and production
credentials remain required before release promotion.

### Publication

LMS PR #4 is open at
`https://github.com/ricardojjulia/ChurchCore-LMS/pull/4`. Local verification was
rerun after adding the production migration ordering and M5 OpenAPI amendment:
lint, typecheck, 221 unit tests, actionlint, JSON validation, version consistency,
and the focused production approval/migration/function order check all pass.
Hosted checks are pending; no merge or deployment is claimed.

## Review follow-up — 2026-09-15T16:13:28+00:00

- Confirmed both required GitHub staging secret names after user saved the token. Stored values remain hidden; no real deployment is claimed.
- Reduced access-token scope to validation and Supabase execution steps.
- Replaced the stale canonical release example with the checked-in workflow reference and synchronized environment settings and CI check names.
- Verified Supabase CLI 2.116.0 accepts multiple function names and obtains temporary database credentials through the Management API. The review's mandatory-password and single-function claims do not apply to this pinned version; setup documentation links the versioned upstream source.
- Version 0.26.2 records this follow-up. Architect review and production configuration remain gates before promotion. Local follow-up verification passed: 221 tests with coverage, typecheck, lint, build, version, actionlint, diff/credential review, and 13 executed workflow checks. Hosted follow-up checks will run after publication.

## Council review follow-up

- Added workflow-level release serialization and a latest-`main` SHA check before
  production mutation to prevent stale approval from deploying older functions.
- Pinned the reviewed staging and production project references in workflow code;
  mismatched or identical targets fail before Supabase setup or mutation.
- Production secrets, the `main` deployment-branch restriction, and the required
  reviewer rule are now configured in GitHub without exposing secret values.
- Vercel production sequencing remains a merge blocker. Chrome is not signed in,
  so its project settings could not be inspected or changed in this run.
