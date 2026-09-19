# Plan - OneRoster Student Data Exchange

Council record: `docs/council/COUNCIL-2026-017.md`

## Decision

Adopt OneRoster 1.2 as an optional interoperability layer:

- ChurchCore Academy is the Provider/source of truth.
- ChurchCore LMS is the Consumer/learning delivery system.
- LMS standalone mode remains first-class and default.

## Phases

1. Preflight stabilization
   - Fix schema drift and stale tests/scripts before integration code.
   - Required checks: `npm run typecheck`, `npm run version:check`, `npm run test:run`, `supabase db lint --linked`.

2. OneRoster data model
   - Add connection, source mapping, import job, and quarantine/staging tables.
   - Add RLS and indexes from the first migration.

3. CSV validation and preview
   - Server-side ZIP/CSV parsing.
   - Validate manifest, headers, field allowlists, row limits, references, roles, and tenant scope.
   - Produce preview counts without applying changes.

4. Idempotent apply
   - Apply only approved staged rows.
   - Map users, roles, academic sessions, courses, classes, and enrollments into LMS tables.
   - Use `external_entity_links` for stable source IDs.

5. Academy CSV provider
   - Add OneRoster package export in ChurchCore Academy.
   - Reuse Academy `lms-contract` and `lms-roster-source` patterns.

6. Scheduled pull
   - Add tenant-scoped automated import after manual CSV proves stable.

7. REST/result return
   - Deferred until separate ADR/council review.

## Key Security Rules

- No shared database between Academy and LMS.
- No cross-system Supabase service-role keys.
- No OneRoster tokens in browser-visible code or org settings JSON.
- No raw student PII in logs, audit metadata, analytics, AI prompts, or client errors.
- Field allowlists only.
- Soft deactivate imported deletes.
- Guardian data and grade return are deferred.

## Acceptance Criteria

- Standalone LMS runs without Academy or OneRoster settings.
- Admin can validate and preview a OneRoster CSV ZIP before apply.
- Apply is idempotent by `(org_id, source_system, object_type, sourced_id)`.
- Cross-tenant import attempts fail.
- Invalid rows quarantine with redacted reasons.
- RLS tests cover same-org, cross-org, unauthenticated, and suspended tenant boundaries.
- Existing native LMS workflows keep passing.
