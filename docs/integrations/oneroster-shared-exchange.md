# Shared OneRoster Exchange

Date: 2026-09-12
Status: Phase 2 conformance implemented; scheduled exchange next

ChurchCore LMS consumes and returns data through the shared OneRoster exchange standard used with ChurchCore Academy.

## Boundary

- Academy is the SIS and system of record.
- LMS is the learning runtime.
- LMS standalone mode must keep working without Academy.
- OneRoster is the exchange standard between the systems.

## Current LMS Surface

- `src/lib/oneroster`: CSV parsing, ZIP reading, schema validation, preview, apply helpers, and tests.
- `src/lib/oneroster/academy-contract.test.ts`: Academy fixture conformance, metadata hash checks, ZIP readback, sensitive-field exclusion, and preview row-count assertions.
- `src/app/api/integrations/oneroster`: protected validation, job history, apply, and identity-link routes.
- `src/app/admin/integrations/oneroster`: admin import, preview, history, and identity-linking UI.
- `supabase/migrations/20260907101000_oneroster_foundation.sql`: import tables and provenance.
- `supabase/migrations/20260907110000_oneroster_transactional_apply.sql`: service-only academic apply.
- `supabase/migrations/20260908100000_oneroster_preview_history_cleanup.sql`: preview and retention.
- `supabase/migrations/20260908113000_oneroster_provenance_guards.sql`: managed-field protection.
- `supabase/migrations/20260908120000_oneroster_bulk_omission_reconciliation.sql`: approved bulk omission behavior.
- `supabase/migrations/20260908130000_oneroster_identity_linking.sql`: existing-profile identity linking.

## Required Shared Files

The first shared contract is OneRoster 1.2 CSV:

- `manifest.csv`
- `orgs.csv`
- `users.csv`
- `roles.csv`
- `academicSessions.csv`
- `courses.csv`
- `classes.csv`
- `enrollments.csv`

## Import Rules

- Validate full source rows before redaction.
- Stage only allowlisted fields.
- Redact names, email, phone, username, and other PII from persisted normalized payloads unless a later decision authorizes a specific retained field.
- Use `external_entity_links` for source provenance.
- Keep source-owned LMS fields locked in native forms while allowing LMS-local enrichment.
- Reject or quarantine source rows that require unapproved identity or privilege changes.

## Next Phase

The next phase is scheduled transport and reconciliation:

1. LMS pulls or receives the Academy tenant-level OneRoster ZIP package with package-hash idempotency.
2. LMS records transport attempts, retries, validation failures, preview summaries, and operator audit events.
3. LMS preserves standalone mode and no-provider mode when Academy exchange is disabled.
4. LMS keeps identity linking explicit and rejects auto-provisioning until separately approved.
5. LMS reports reconciliation and managed-field status through the existing OneRoster admin surface.

## Verification

- 2026-09-12: `npm run test:run -- src/lib/oneroster/academy-contract.test.ts src/lib/oneroster/validate.test.ts src/lib/oneroster/zip.test.ts` passed: 3 files, 16 tests.
- 2026-09-12: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` passed.
- 2026-09-12: Academy mirror generated `fixtures/oneroster/churchcore-academy-rostering-v1` without manual CSV edits.
