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
