# Progress - OneRoster Student Data Exchange

## 2026-09-07

- Confirmed repo connection: `/Users/rjulia/ChurchCore LMS`, branch `main`, remote `https://github.com/ricardojjulia/ChurchCore-LMS.git`.
- Re-read `CLAUDE.md` and `.ai-factory/rules/*`.
- Confirmed no `AGENTS.md` exists in the LMS repo root scan.
- Started Phase 0 stabilization before OneRoster data-model work.
- Spawned read-only sidecar agents for:
  - schema/function drift
  - RLS/data model patterns
  - parser/API/UI patterns

### Implemented

- Repaired dashboard course publication drift by selecting `courses.status` and deriving `isPublished`.
- Repaired the stale enrollment bridge E2E test from `student_uid`/`enrollment_status` to `user_id`/`status`.
- Replaced removed Next.js `next lint` script with a working ESLint command and added repo lint config.
- Fixed `QuizPlayer` hook-order lint error by moving early returns after hooks.
- Added OneRoster foundation migrations:
  - `oneroster_connections`
  - `external_entity_links`
  - `oneroster_import_jobs`
  - `oneroster_import_rows`
- Added forward migrations to repair live DB lint findings.
- Added server-side OneRoster parser/validator modules under `src/lib/oneroster`.
- Added focused OneRoster parser/validator tests.
- Added admin OneRoster validation page and protected validation API.
- Added OneRoster admin navigation links for desktop and mobile.
- Added academic-structure apply support for sessions, courses, and classes with provenance links and idempotent hashes.
- Added quarantine behavior for users, roles, and enrollments until explicit identity-linking rules are approved.
- Added active-tenant RLS enforcement and 24-hour staging retention for OneRoster jobs.
- Redacted user PII from staged normalized payloads; validation still checks the source package before redaction.
- Applied all new migrations to the linked Supabase project.

### Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npx vitest run src/lib/oneroster/*.test.ts` passed: 3 files, 8 tests.
- `npm run test:run` passed: 20 files, 170 tests.
- `npm run build` passed and included `/admin/integrations/oneroster` plus `/api/integrations/oneroster/validate`.
- `supabase db lint --linked` passed with no schema errors after migrations.
- `supabase db push --linked --yes` applied the active-tenant policy and staging-retention migrations.
- Runtime smoke:
  - Dev server started on `http://localhost:3002`.
  - Unauthenticated `POST /api/integrations/oneroster/validate` returns `401`.
  - Unauthenticated `/admin/integrations/oneroster` is protected and redirects to `/login`.
  - Linked Supabase service smoke confirms the four OneRoster tables are queryable and empty.

### Remaining

- Authenticated browser upload preview needs a logged-in admin session for full visual verification.
- Authenticated browser upload and apply verification needs a logged-in admin session.
- User provisioning, role/enrollment identity linking, scheduled Academy CSV pulls, REST, guardian data, and result return remain later phases.
- `npm install csv-parse jszip` reported existing audit debt: 43 vulnerabilities.

## 2026-09-07 Resumed Verification

### Repairs

- Replaced the per-request apply loop with the service-only, security-invoker
  `apply_oneroster_academic_job` database function. It validates the actor's
  tenant and role, locks the job and source, processes all staged rows, and
  commits each academic record together with its provenance link.
- A failed row rolls back its academic mutation and receives a redacted reason.
  Failed job finalization/audit rolls back the whole transaction. Replaying a
  completed job is rejected; uploading the same rows is idempotent.
- Scoped generated academic codes to org and source to avoid global code
  collisions. Sparse deletes deactivate existing records without recreating them.
- Fixed manifest handling, missing-target checks, and ambiguous class-term
  mappings. Users, roles and enrollments remain deferred to account linking.
- Staging stays `validating` until all 500-row batches succeed; incomplete or
  expired staging cannot apply. Upload explicitly checks active tenant status.
- Redacted source identifiers, unexpected filenames and header values from
  validation issues; upload filenames are no longer persisted.
- Fixed text-form-data upload handling and the misleading success styling for
  imports with quarantined rows. Reset is disabled while apply is running.
- Added synthetic ZIP generation: `node scripts/oneroster-verification-fixtures.mjs`.

### Verified In This Session

- Candidate migration and all fixture mutations tested inside a rolled-back
  transaction before deployment.
- Applied `20260907110000_oneroster_transactional_apply.sql` to linked Supabase.
- `supabase test db --linked supabase/tests/oneroster_apply_test.sql`: PASS,
  31 pgTAP checks plus PL/pgSQL assertions for creation, replay, updates,
  failed-write rollback, soft deletion, deferred identity rows, incomplete and
  expired staging, cross-tenant rejection, and a 1,005-course import.
- RLS exercises admin, manager, teacher, student, suspended tenant and anonymous
  reads, plus forbidden client writes and service-function execution grants.
- `npm run test:run`: PASS, 22 files / 184 tests.
- `npm run typecheck`, `npm run lint`, `npm run version:check`,
  `npm run build`, `git diff --check`: PASS.
- `supabase db lint --linked`: PASS, no schema errors. First attempt had a
  transient connection failure; retry succeeded.
- Live unauthenticated validation and apply POST requests both return 401.
- Chrome admin session confirmed; OneRoster upload page rendered and inspected
  at desktop and 390px mobile widths. Viewport override reset after inspection.

## 2026-09-08 Authenticated Browser Verification

- Chrome admin session uploaded all three synthetic packages successfully.
- Invalid package: 6 total rows, 5 ready, 1 quarantined; the class reported
  `Unknown courseSourcedId.` and Apply remained disabled.
- Initial valid apply: 3 created, 3 unchanged, 0 quarantined.
- Repeated valid apply: 0 created, 6 unchanged, confirming idempotency.
- Deactivation apply: 3 unchanged, 3 deactivated, confirming soft deletion.
- The synthetic academic records remain inactive after the final deactivation
  fixture; no user, role, or enrollment records were provisioned.

## 2026-09-08 Preview, History, And Retention

- Added service-only `preview_oneroster_academic_job`, which classifies staged
  academic rows as create, update, unchanged, deactivate, or quarantine using
  the same source mapping and payload hashes as apply.
- Validation now returns planned change counts before an admin can apply.
- Added a tenant-scoped recent-import history endpoint and compact history table
  showing status, row totals, mutations, and quarantine counts.
- Added `purge_expired_oneroster_staging()` and an hourly pg_cron schedule. The
  purge excludes applying jobs and removes staged rows through the existing
  cascading foreign key.
- Applied `20260908100000_oneroster_preview_history_cleanup.sql` to linked
  Supabase.

### Verification

- `npm run test:run`: PASS, 22 files / 188 tests.
- `npm run typecheck`, `npm run lint`, `npm run version:check`, `npm run build`,
  and `git diff --check`: PASS.
- Existing linked apply suite: PASS, 31 pgTAP checks.
- New linked preview/cleanup suite: PASS, 5 pgTAP checks plus transactional
  assertions covering initial and repeat previews, deactivation, deferred
  identity quarantine, cascade cleanup, and applying-job preservation.
- `supabase db lint --linked`: PASS, no schema errors.
- Authenticated Chrome verification: recent history rendered; a valid package
  against the inactive synthetic records previewed 0 creates, 3 updates,
  3 unchanged, 0 deactivations, and 0 quarantines before apply.
- A clean browser reload contained no `NaN` output. Chrome emitted only its
  extension message-channel warning, not an application error.

## 2026-09-08 Tooling, Concurrency, And Delta Semantics

- Repaired the normal `supabase` command with a user-local ARM-native launcher
  pinned to CLI 2.107.0. Homebrew's Intel Node upgrade cannot build on the
  installed macOS/Command Line Tools combination, and CLI 2.116.0 hangs during
  linked-project login; the pinned launcher completed linked tests normally.
- Added `scripts/oneroster-concurrency-test.mjs`. It uses two independent linked
  database sessions to hold the source advisory lock, verifies a contended apply
  is rejected, verifies apply succeeds after release, and removes its exact
  synthetic tenant, auth user, job, academic record, provenance, and audit data.
- Verified cleanup after the concurrency run: synthetic organizations, users,
  and jobs all returned zero rows.
- Aligned package validation with the official OneRoster 1.2.1 CSV manifest:
  manifest version 1.0, OneRoster version 1.2, per-file absent/bulk/delta
  declarations, file-set consistency, unique properties, and non-empty supplied
  data files.
- Before omission reconciliation, bulk packages were rejected and the supported
  contract was delta import. Optional files marked absent no longer need empty
  placeholder CSVs.
- Regenerated browser fixtures with complete delta manifest declarations and no
  empty placeholder files.

### Verification

- Normal PATH command `supabase --version`: PASS, 2.107.0.
- Normal PATH command ran the linked preview/cleanup suite: PASS, 5 checks.
- Independent-session concurrency harness: PASS; contention rejected and
  post-release apply created one course.
- `npm run test:run`: PASS, 22 files / 191 tests.
- `npm run lint`, `npm run build`, and `git diff --check`: PASS.

### Remaining Scope

- Implement bulk omission reconciliation before accepting `bulk` manifests.
- Identity linking, Academy export, and scheduled pulls remain behind the
  existing approval boundary. REST, guardians, and result return stay deferred.

## 2026-09-08 Academic Provenance Guards

- Added database-enforced update guards for externally managed terms,
  blueprints, and sections. Authenticated LMS admins cannot overwrite
  OneRoster-owned identifiers, dates, relationships, delivery format, or
  source status; the service role remains able to apply source updates.
- Preserved LMS-local enrichment: term config; blueprint description, credits,
  and program track; and section enrollment settings.
- Updated native edit pages to show a `OneRoster managed` marker, lock imported
  controls, and label local-only saves as `Save LMS Settings`.
- Applied migrations `20260908113000_oneroster_provenance_guards.sql` and
  `20260908114000_fix_oneroster_provenance_guard_dispatch.sql` to linked
  Supabase. The second migration fixes PostgreSQL record-field dispatch found
  by the initial pgTAP run.

### Verification

- New linked provenance suite: PASS, 9 pgTAP checks.
- Existing linked apply suite: PASS, 31 pgTAP checks, proving service imports
  remain functional.
- `npm run test:run`: PASS, 22 files / 191 tests.
- `npm run typecheck`, `npm run lint`, `npm run build`, and linked database lint:
  PASS.
- Authenticated Chrome verification: managed term and blueprint source controls
  are locked while local fields remain enabled; managed section enrollment
  settings remain enabled.

## 2026-09-08 Bulk Omission Reconciliation

- Added `ONEROSTER_BULK_SUPPORTED_FILES` for academic sessions, courses, and
  classes. Other bulk declarations remain rejected until identity linking is
  approved.
- Added bulk manifest reconciliation to preview and apply. For each declared
  academic bulk file, active OneRoster-linked records omitted from the staged
  file are counted as deactivated, soft-deactivated in the LMS, and marked
  `source_status = inactive` in provenance.
- Applied `20260908120000_oneroster_bulk_omission_reconciliation.sql` to linked
  Supabase.

### Verification

- Linked preview/cleanup suite: PASS, covering course, class, and academic
  session omission preview/apply paths and provenance updates.
- Linked apply suite: PASS, 31 pgTAP checks.
- Linked provenance suite: PASS, 9 pgTAP checks.
- `npm run test:run`: PASS, 22 files / 192 tests.
- `npm run typecheck`, `npm run lint`, `npm run version:check`, `npm run build`,
  `supabase db lint --linked`, and `git diff --check`: PASS.

### Remaining Scope

- Identity linking for users, roles, and enrollments remains deferred.
- Academy export, scheduled pulls, REST, guardians, and result return remain
  deferred behind the existing approval boundary.

## 2026-09-08 Identity Linking

- Added explicit admin/manager linking from a OneRoster `users` sourcedId to an
  existing tenant-scoped LMS profile. The importer never creates Auth accounts
  from roster data.
- Added tenant- and actor-checked identity-link API routes with a profile picker
  in the OneRoster preview workflow. Links are persisted through a service-only
  database function and preview counts refresh after each link.
- Added safe role application for linked `student` and `teacher` roles. Admin,
  manager, guardian, parent, relative, aide, and proctor roles remain
  quarantined or require approval; source data cannot escalate LMS privileges.
- Added linked student enrollment application to `direct_enrollments` with
  `source = import`, provenance links, soft withdrawal handling, and explicit
  reactivation quarantine for completed or withdrawn records.
- Applied `20260908130000_oneroster_identity_linking.sql` to linked Supabase.

### Verification

- New linked identity suite: PASS, 3 pgTAP checks plus transactional assertions
  for missing links, profile linking, role/enrollment apply, provenance,
  privileged-role quarantine, and cross-tenant rejection.
- Existing linked apply suite: PASS, 31 pgTAP checks.
- Existing linked preview/cleanup suite: PASS, 5 pgTAP checks.
- Existing linked provenance suite: PASS, 9 pgTAP checks.
- `npm run test:run`: PASS, 23 files / 196 tests.
- `npm run typecheck`, `npm run lint`, `npm run version:check`, `npm run build`,
  and `git diff --check`: PASS.
- `supabase db lint --linked`: PASS with no schema errors; one non-blocking
  unused-variable warning remains in the preview wrapper.
- Authenticated browser verification: OneRoster page renders the linking
  guidance and import history cleanly; only the known extension
  message-channel warning appeared in browser logs.

### Remaining Scope

- Automatic Auth user provisioning remains intentionally deferred; linking is
  existing-profile-only.
- Academy export, scheduled pulls, REST, guardians, and result return remain
  deferred behind the existing approval boundary.

## 2026-09-14 Certification Verification Refresh

- Reconfirmed repo connection: `/Users/rjulia/ChurchCore LMS`, branch `main`,
  remote `https://github.com/ricardojjulia/ChurchCore-LMS.git`.
- Continued from `COUNCIL-2026-018`, `ADR-2026-009`, and factory phase
  `identity_linking_verified`.
- Added forward migration
  `20260914121000_fix_oneroster_preview_lint_warning.sql` to redefine
  `preview_oneroster_job` with the enrollment class lookup used directly.
- Applied the migration to linked Supabase.

### Verification

- `npx vitest run src/lib/oneroster/*.test.ts`: PASS, 7 files / 39 tests.
- `npm run test:run`: PASS, 24 files / 201 tests.
- `npm run typecheck`, `npm run lint`, `npm run version:check`, `npm run build`,
  and `git diff --check`: PASS.
- `supabase --version`: PASS, 2.107.0.
- `supabase db lint --linked`: PASS, no schema errors and no warnings after the
  forward migration.
- Linked OneRoster pgTAP suites: PASS.
  - `oneroster_apply_test.sql`: 31 tests.
  - `oneroster_preview_cleanup_test.sql`: 5 tests.
  - `oneroster_provenance_guard_test.sql`: 9 tests.
  - `oneroster_identity_linking_test.sql`: 3 tests.
- `node scripts/oneroster-concurrency-test.mjs`: PASS; contended apply was
  rejected and post-release apply created one course.
- Local unauthenticated route smoke on `http://localhost:3002`: admin page
  redirects to `/login`; validation and jobs APIs return `401 Unauthorized`.

### Remaining Scope

- Automatic Auth user provisioning remains intentionally deferred; linking is
  existing-profile-only.
- Academy export shipment/merge state belongs to the Academy repo workflow.
- Scheduled pulls, REST, guardians, and result return remain deferred.

## 2026-09-14 M3 Signed Scheduled Delivery

- Ratified `COUNCIL-2026-019` by a 6/6 council vote and implemented its numbered
  LMS scope on branch `codex/oneroster-scheduled-exchange` in a clean worktree.
- Added Ed25519-signed, connection-specific inbound delivery with a five-minute
  clock window, delivery-ID replay protection, package-hash idempotency, 10 MB
  compressed limit, and stable redacted error responses.
- Extracted manual and scheduled package staging into one server-only path.
  Scheduled receipt validates and stages only; authenticated admin/manager
  preview, identity linking, and apply remain separate mandatory actions.
- Added public-key and cadence connection configuration, transport history,
  received-job review, and responsive Imports/Connection admin views.
- Added the tenant-scoped immutable `oneroster_transport_attempts` ledger.
  Authenticated users have read-only RLS access in their active tenant and the
  service role has insert/select privileges only.
- Repaired `ci.yml` with `workflow_call` while preserving push and pull-request
  triggers. Bumped the LMS release metadata to `0.26.0`.
- Did not edit, commit, or push ChurchCore Academy. Did not link or modify the
  newly provisioned cloud Supabase project.

### Verification

- Fresh `supabase db reset --local`: PASS through
  `20260914160000_oneroster_signed_delivery.sql`.
- Five OneRoster pgTAP files: PASS, 58 assertions covering apply, preview,
  identity linking, provenance, replay uniqueness, active-tenant RLS, invalid
  connection constraints, and immutable service-role behavior.
- Full repository unit suite: PASS, 29 files / 221 tests.
- Focused OneRoster suite: PASS, 12 files / 59 tests.
- Disposable-local E2E: PASS, 8 files / 77 tests.
- `npm run typecheck`, `npm run lint`, `npm run version:check`, production
  `npm run build`, workflow YAML parsing, secret-pattern scan, and
  `git diff --check`: PASS.
- `supabase db lint --local`: PASS with no schema errors.
- Authenticated Chrome verification on `http://127.0.0.1:3011`: desktop and
  `390x844` Imports/Connection views rendered without horizontal overflow or
  application-origin console errors; the temporary viewport was reset.
- The full legacy `supabase test db` directory remains red because eight
  unrelated inherited suites assume older schemas or pgTAP syntax. All five
  OneRoster SQL files passed both within that run and in an isolated rerun.

### Remaining Scope

- LMS PR #3 opened from `codex/oneroster-scheduled-exchange`; its implementation
  head passed both hosted CI lanes, disposable E2E, and Vercel preview.
- Explicitly assign and gate a staging Supabase project before release promotion.
- Implement and prove the Academy sender in a separately authorized Academy
  worktree and PR.
- REST transport, guardians, and result return remain deferred.

## 2026-09-14 E2E Gate Restoration

- Replaced the shared-cloud E2E dependency with a disposable local Supabase
  stack inside each GitHub Actions runner. CI now generates its test password,
  rebuilds the schema, creates Auth users, seeds deterministic tenant fixtures,
  serves Edge Functions, and starts Next.js before running tests.
- Added a dedicated Vitest E2E configuration so both E2E directories are
  discovered and an empty suite fails instead of reporting a false pass.
- Repaired Auth session setup, tenant fixtures, enrollment bridge identity
  mapping, API-role table privileges, stale profile policies, tenant suspension
  propagation, enrollment audit actors, and certificate tenant validation.
- Kept the newly provisioned cloud Supabase development project untouched; it
  is not required by the PR test gate.

### Verification

- Fresh `supabase db reset --local`: PASS through migration
  `20260914154000_restore_anon_table_read_privileges.sql`.
- Fresh Auth setup and deterministic SQL seed: PASS, 6 users and 6 profiles.
- `npm run test:e2e`: PASS, 8 files / 77 tests against the rebuilt stack.
- `npm run test:ci`: PASS, 24 files / 201 tests.
- `npm run typecheck`, `npm run lint`, `npm run version:check`,
  `npm run build`, workflow YAML parsing, and `git diff --check`: PASS.
- Local OneRoster pgTAP suites: PASS, 31 apply, 5 preview/cleanup,
  9 provenance guard, and 4 identity-link checks.
- Public schema audit: every ordinary table has RLS enabled.

## 2026-09-14 Authenticated Browser Verification Refresh

- Verified the local dev server was running on `http://localhost:3002`.
- Connected an isolated browser session through a one-time seeded demo-admin
  login for the `Biblos` demo tenant.
- Generated `/tmp/oneroster-verification/{invalid,valid,deactivate}.zip` with
  `scripts/oneroster-verification-fixtures.mjs`.

### Browser Evidence

- Authenticated `/admin/integrations/oneroster` rendered the OneRoster upload
  workflow and recent-import history.
- Invalid package upload showed 13 rows with 1 quarantined `classes.csv` row:
  `Unknown courseSourcedId.` Apply remained disabled.
- Valid package upload passed validation; apply created 3 academic changes and
  added an `Applied` history row with 13 rows, 3 changes, 0 quarantined.
- Replaying the same valid package applied idempotently with 13 rows, 0 changes,
  0 quarantined.
- Deactivation package applied with 13 rows, 3 changes, 0 quarantined.
- Managed term and blueprint pages showed `OneRoster managed`; source-owned
  active/type controls were disabled; local-only save labels remained
  `Save LMS Settings`.
- Managed section page showed `ONEROSTER MANAGED`; enrollment settings remained
  editable for local LMS policy.
- Mobile viewport `390x844` rendered the OneRoster history and managed section
  page with no Next.js error overlay.
- Browser page-error check reported no page errors.

### Remaining Scope

- Automatic Auth user provisioning remains intentionally deferred; linking is
  existing-profile-only.
- Academy export shipment/merge state belongs to the Academy repo workflow.
- Scheduled pulls, REST, guardians, and result return remain deferred.


## 2026-09-16 Daily Factory Reconciliation

PR #3 and release repair PR #4 are merged; origin/main is 8d1c453. Release
35030408024 completed staging and production on September 15. The earlier
unassigned-staging/open-LMS-PR notes above are historical and resolved.

COUNCIL-2026-020 repairs inherited SQL verification, tenant boundaries and group
UX in a separate LMS branch, codex/daily-lms-2026-09-16. Local unit coverage,
type, lint, production build, 302 transactional SQL assertions and two-session
OneRoster concurrency checks pass. Full fresh-stack hosted verification remains
the publication gate; the local isolated service startup stalled.

M3 remains incomplete pending separate Academy sender authorization and
cross-repository delivery proof. Auth creation, automatic apply, Gradebook and
REST are not enabled by this repair. No new general-memory implementation plan
is appropriate while the approved shared plan remains unfinished.

Hosted follow-up: PR #5 implementation b1c4a37 passed fresh migration application,
all 14 SQL suites/302 assertions and 8 E2E files/77 tests in run 35114858821.
The former legacy SQL-suite blocker is resolved; architect review is pending.

## 2026-09-17 Daily Factory Reconciliation

Main f3c384c adds controlled Vercel promotion (PR #6). Release 35148363218 passed
staging and is waiting for production approval. No approval submitted today.
PR #5 now incorporates main, COUNCIL-2026-021 and version 0.26.4. Local proof:
239 unit tests, 327 SQL assertions, 77 E2E tests on a production build, fresh
isolated Supabase, database lint/concurrency and authenticated desktop/mobile
checks. The Academy sender and cross-repository proof remain outside this run;
M3 is still incomplete and no new major-feature plan is initiated.
