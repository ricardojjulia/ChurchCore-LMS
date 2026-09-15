# Shared OneRoster Standard Plan

Date: 2026-09-12
Council: `docs/council/COUNCIL-2026-018.md`
Status: In progress

## Goal

Make OneRoster 1.2 the professional-grade shared standard between ChurchCore Academy and ChurchCore LMS.

Academy is the OneRoster rostering Provider. LMS is the OneRoster rostering Consumer. LMS later becomes the gradebook/result Provider back to Academy, and Academy imports those results through a reviewed workflow.

## Current LMS Baseline

The LMS already has:

- OneRoster validation and ZIP parsing under `src/lib/oneroster`
- admin import UI under `/admin/integrations/oneroster`
- validation/apply/history/identity-link API routes
- staging tables and provenance links
- academic session, course, class, user-link, role, and student-enrollment apply paths
- bulk omission reconciliation for academic sessions, courses, and classes
- provenance guards for externally managed academic records

## LMS Workstream

### M1 - Profile hardening

- Add complete OneRoster CSV 1.2.1 file vocabulary.
- Keep current ChurchCore-supported profile explicit.
- Return profile-aware safe errors for official-but-unsupported files.
- Update `users.csv` 1.2 header vocabulary.
- Preserve redaction and allowlists.

Status: started on 2026-09-12. The importer now distinguishes official-but-out-of-profile OneRoster files from truly unknown files and accepts current OneRoster 1.2 `users.csv` headers without staging unsupported PII fields.

### M2 - Academy fixture parity

- Consume deterministic Academy-generated packages in LMS tests.
- Validate manual export/import parity.
- Ensure package replay is idempotent.
- Verify cross-tenant and source-system isolation.

Status: started on 2026-09-12. The LMS Academy-contract test now accepts the Academy repository-backed export shape, including stable `academy:*` sourced IDs, school-year plus period sessions, teacher/student-only roles, and withdrawn enrollment deactivation. It also consumes `../ChurchCore Academy/fixtures/oneroster/churchcore-academy-rostering-v1`, verifies fixture metadata and hashes, validates the package with no manual edits, checks sensitive-field exclusion, and proves ZIP extraction parity with the same files.

### M3 - Scheduled exchange

- Add tenant-scoped connection scheduling.
- Pull or receive signed Academy exports.
- Reuse the current validate, stage, preview, apply pipeline.
- Make retries idempotent and audit-visible.

Status: LMS implementation verified locally on 2026-09-14 under
`COUNCIL-2026-019`. The LMS accepts connection-specific Ed25519-signed package
delivery, stages without automatic apply, exposes immutable tenant-scoped
attempt history, and requires authenticated preview/link/apply. Hosted LMS CI,
staging assignment, and the separately authorized Academy sender PR remain
required before M3 is complete.

### M4 - Gradebook return

- Map LMS assignments/quizzes/results to OneRoster gradebook files or REST objects.
- Return only reviewed, scoped grade/progress data to Academy.
- Do not expose raw learning activity or unpublished grade state.
- Keep transcript mutation in Academy, not LMS.

### M5 - REST and certification readiness

- Implement selected OneRoster REST consumer/provider operations.
- Treat the localized OpenAPI 3 documents as the REST contract and serve them at
  the OneRoster 1.2 discovery paths required for each implemented provider role.
- Generate an authenticated Swagger UI from those documents for operator and
  integrator use; the UI is optional tooling and is not a conformance dependency.
- Keep M3 signed CSV delivery routes outside the public OneRoster REST contract.
- Use OAuth 2.0 client credentials for REST operations; do not reuse the
  Ed25519 CSV transport keys as API credentials.
- Add contract-drift checks plus negative authentication, authorization, and
  tenant-isolation coverage against the published OpenAPI documents.
- Add conformance-oriented test fixtures.
- Document exact supported profile claims.

## Verification Matrix

- Unit: parser, schema/profile, header validation, redaction.
- Database: preview/apply, omission reconciliation, identity linking, provenance guards.
- API: unauthenticated rejection, tenant-scoped access, safe errors.
- Browser: admin package upload, preview, identity linking, apply, history.
- Cross-repo: Academy fixture validates and applies in LMS.
- Reconciliation: create/update/unchanged/deactivate/quarantine counts match backing data.

## Non-Goals For The Next Slice

- Ed-Fi canonical API.
- PESC transcript exchange.
- CLR credential exchange.
- OneRoster guardian/agent import without a separate privacy review.
- Automatic LMS Auth provisioning from OneRoster users.
