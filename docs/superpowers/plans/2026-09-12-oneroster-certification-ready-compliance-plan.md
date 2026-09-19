# OneRoster Certification-Ready Compliance Plan

Date: 2026-09-12
Plan name: `2026-09-12-oneroster-certification-ready-compliance-plan.md`
Repos: ChurchCore LMS and ChurchCore Academy
Status: Planned

## Summary

Build ChurchCore around OneRoster as the Academy/LMS interoperability contract, with OneRoster 1.2 and CSV Binding 1.2.1 as canonical, v1.1 compatibility as an adapter lane, and certification-ready evidence without claiming formal 1EdTech certification until paid certification is completed.

Reference materials:

- 1EdTech OneRoster: https://www.1edtech.org/standards/oneroster
- OneRoster 1.2 Rostering Information Model: https://www.imsglobal.org/sites/default/files/spec/oneroster/v1p2/rostering-informationmodel/OneRosterv1p2RosteringService_InfoModelv1p0.html
- OneRoster 1.2 CSV Binding 1.2.1: https://www.imsglobal.org/spec/oneroster/v1p2/bind/csv/
- OneRoster 1.2 Certification Guide: https://www.imsglobal.org/spec/oneroster/v1p2/cert/
- OneRoster 1.2 Gradebook Information Model: https://www.imsglobal.org/spec/oneroster/v1p2/gradebook/info
- OneRoster 1.2 Gradebook REST Binding: https://www.imsglobal.org/spec/oneroster/v1p2/gradebook/bind/rest
- OneRoster v1.1 Final Specification: https://www.imsglobal.org/oneroster-v11-final-specification
- OneRoster v1.1 CSV Tables: https://www.imsglobal.org/oneroster-v11-final-csv-tables
- OneRoster v1.1 Best Practices and Implementation Guide: https://www.imsglobal.org/oneroster-v11-final-best-practice-and-implementation-guide
- OneRoster v1.1 Conformance Guide: https://www.imsglobal.org/ims-oneroster-v11-final-conformance-guide
- OneRoster Implementation FAQ, Data Governance: https://www.1edtech.org/standards/oneroster/implementation-faq#DataGovernance-2

## Council Decision Required

Before implementation, run this plan through matching council records in both repos.

Council must ratify:

- Academy is the OneRoster Rostering Provider and Gradebook Consumer.
- LMS is the OneRoster Rostering Consumer and Gradebook Provider.
- OneRoster 1.2 and CSV Binding 1.2.1 are canonical.
- OneRoster v1.1 is compatibility only and implemented through boundary adapters.
- The first compliance train covers Rostering and Gradebook only.
- Resources and Assessment Results are later profiles.
- "Certification-ready" is the product claim until formal 1EdTech certification is funded and completed.
- No automatic LMS Auth user creation is included in this release.
- Guardians, agents, demographics, and sensitive student attributes require a separate privacy council amendment before export or import.

## Implementation Plan

Shared profile and conformance model:

- Add a shared OneRoster profile document and typed profile module in both repos.
- Define profile id `churchcore-oneroster-1p2p1-rostering-gradebook`.
- Define compatibility profile ids `churchcore-oneroster-v1p1-csv-import` and `churchcore-oneroster-v1p1-csv-export`.
- Generate a conformance matrix covering version, service, transport, provider/consumer role, required objects, required operations, optional operations, current support, tests, and claim status.
- Treat `sourcedId` as an interoperability key only; never use it as an internal primary key.
- Maintain tenant/source/object/sourcedId mappings with source hashes, local ids, provenance status, and audit evidence.

Academy Rostering Provider:

- Reintroduce Academy provider work only through a clean Academy PR, because the prior Academy OneRoster PR was reverted after being pushed from the LMS workspace.
- Export OneRoster 1.2.1 CSV ZIP packages from persisted Academy people, roles, orgs, academic sessions, courses, classes, and enrollments.
- Serve manual admin download first, then add signed scheduled export or LMS pull after fixture parity passes.
- Implement REST Rostering Provider endpoints with OAuth 2.0 Client Credentials, paging, sorting, filtering, and field selection.
- Export only approved roster PII. Do not export passwords, access tokens, refresh tokens, client secrets, webhook secrets, raw provider payloads, or unauthorized demographics.

LMS Rostering Consumer:

- Extend the current LMS importer from the approved roster subset to certification-ready validation for the OneRoster 1.2.1 vocabulary.
- Keep approved apply support scoped to orgs, users, roles, academic sessions, courses, classes, and enrollments until each added file has a council-approved local mapping.
- Support Academy CSV ZIP upload, scheduled pull, and REST pull through the same validate, stage, preview, link, apply, history, and reconciliation pipeline.
- Preserve explicit identity linking. OneRoster users may map to existing LMS profiles, but this release must not auto-create Supabase Auth users.
- Keep service-only apply, idempotent replay, bulk omission reconciliation, source hashes, provenance guards, quarantine reasons, and operator-visible history.

Gradebook return:

- LMS emits OneRoster Gradebook data for categories, lineItems, scoreScales, results, and supported objective/score-scale mapping files.
- Academy consumes OneRoster Gradebook return as reviewed import data.
- Academy must not mutate official grades, transcripts, GPA, standing, completion, or graduation records until an Academy reviewer accepts the batch.
- Support CSV ZIP batch exchange first; add REST Gradebook exchange with OAuth 2.0 Client Credentials after batch parity is verified.
- Keep learning progress and analytics separate from official Gradebook results unless council maps them to OneRoster result fields.

v1.1 compatibility:

- Accept v1.1 CSV through a version-aware boundary adapter.
- Emit v1.1 CSV only when a tenant connection explicitly selects `oneroster_1p1_csv`.
- Keep internal canonical objects 1.2.1-shaped.
- Do not silently downgrade 1.2-only fields; report unsupported downgrade fields in preview.

## Test Plan

Conformance evidence:

- Add machine-readable conformance tests for Academy Rostering CSV Exporter, Academy Rostering REST Provider, LMS Rostering CSV Importer, LMS Rostering REST Consumer, LMS Gradebook Provider, and Academy Gradebook Consumer.
- Create golden fixtures for clean, invalid, delta, bulk, missing-reference, duplicate, deleted/tobedeleted, large-package, unsupported-file, and v1.1 compatibility cases.
- Cross-repo fixtures must prove Academy output imports into LMS without manual edits.
- Cross-repo fixtures must prove LMS Gradebook output imports into Academy reviewed-import staging without official-record mutation.

Security and data governance:

- Prove no secrets or unauthorized PII are exported, staged, logged, sent to AI prompts, or returned in API errors.
- Prove cross-tenant source ids cannot link, preview, apply, or return grades across tenant boundaries.
- Prove privileged roles cannot be created or escalated from OneRoster.
- Prove Auth user creation remains deferred.

Runtime verification:

- LMS: unit tests, route tests, linked Supabase pgTAP tests, concurrency lock test, lint, typecheck, build, and browser verification for upload, preview, identity link, apply, history, and managed-field locks.
- Academy: unit tests, API route tests, repository-backed export tests, gradebook reviewed-import tests, lint, build, and browser verification for admin export/download and gradebook review.
- CI must run the shared conformance suite in both repos before merge.

## Acceptance Criteria

- Academy can export and serve valid OneRoster 1.2.1 Rostering packages from real tenant data.
- LMS can validate, preview, link, apply, replay, reconcile, and audit Academy packages.
- LMS can emit OneRoster Gradebook result packages.
- Academy can stage, review, accept, reject, supersede, and audit returned results.
- v1.1 CSV compatibility works through explicit adapters.
- Standalone LMS remains fully functional without Academy or OneRoster configuration.
- Product docs clearly distinguish certification-ready implementation from formal 1EdTech certification.

## Assumptions

- Formal 1EdTech certification is not part of this implementation unless separately authorized.
- Rostering and Gradebook are the only first-train services.
- Resources and Assessment Results are later profile work.
- Academy implementation must happen through its own clean PR workflow.
- No automatic Auth provisioning is allowed.
- Guardian, agent, and demographics exchange requires a later privacy council record.
