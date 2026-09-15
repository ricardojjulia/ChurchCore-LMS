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

Local verification complete; prepare the LMS repair PR. This record describes
the pre-publication snapshot. The automation memory and execution report record
the eventual PR URL and hosted results.
