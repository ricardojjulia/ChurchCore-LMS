# COUNCIL-2026-034 - Multi-Actor LMS Browser Verification Harness

**Date:** 2026-09-26 (Verified 2026-09-29)
**Status:** COMPLETE — Verified (794/794 tests green)
**Author:** Platform review
**Related:** `CLAUDE.md`, `.ai-factory/rules/testing.md`, `docs/CODE-FACTORY-SYSTEM-PROMPT.md`, `src/tests/e2e/critical-path.test.ts`
**Tags:** testing, e2e, browser-verification, rls, accessibility, qa

---

## Context

The pasted "AI Council of Testers" prompt has the right high-level goal: exercise the LMS as a multi-actor system, pass state between personas, detect UI/runtime failures, and produce a health report that can drive implementation work.

It is not implementation-ready as written for ChurchCore LMS. The original assumes a generic LMS, an "AntiGravity" spatial canvas, coordinate-first interactions, and external LMS features that do not map cleanly to this repository. ChurchCore LMS is a Next.js 16 App Router application backed by Supabase, RLS, seeded real-Supabase E2E tests, and a council-governed implementation workflow. The v2 harness must fit those constraints.

This document translates the concept into a repo-native verification harness for realistic ChurchCore LMS workflows:

- platform and organization administration
- teacher course/content/grading flows
- student learning/submission flows
- guardian read-only visibility
- support/impersonation or audit-style verification where supported
- unauthenticated and cross-tenant denial paths

The harness is intended to add browser-level confidence on top of the existing Vitest, pgTAP/Supabase, and real-Supabase E2E tests. It must not replace RLS tests, deterministic database assertions, or the existing `npm run verify` gate.

---

## Council Assessment

**The Architect:** Approve with amendment. This belongs as a browser-verification layer in the existing factory/testing system, not as a standalone AI prompt. It must use the current repo topology, council documents, seeded Supabase data, and scripts. The implementation must start from an intentional branch because the current checkout has unrelated dirty worktree changes.

**The Engineer:** Approve with amendment. Browser automation is a new dependency and should be introduced deliberately. The implementation should prefer Playwright and configure its `webServer`/base URL behavior explicitly so `npm run test:browser` is repeatable locally and in CI.

**The Security Lead:** Approve with amendment. RLS and tenant isolation remain P0. Browser flows can prove user experience, but security claims require database-backed assertions using authenticated clients for each role. Service-role setup/assertion code may run in the Node test runner only; no service-role key or privileged client may be imported into browser-executed code.

**The Product Owner:** Approve. Multi-actor browser verification directly supports pilot readiness because LMS failures often occur between people: teacher creates, student submits, teacher grades, guardian views, admin audits.

**The QA Lead:** Approve with amendment. Accessible locators and functional labels must be the first strategy. Coordinates and bounding boxes are only fallback diagnostics for layout drift, drag/drop, floating controls, and screenshot comparison.

**The Data Engineer:** Approve with amendment. Every flow that writes data must use deterministic fixture setup, idempotent cleanup, and evidence that no orphaned or cross-tenant rows were created.

**Vote:** 6/6 yes, subject to amendments below.

---

## Amendments Adopted

1. Replace generic LMS personas with ChurchCore LMS personas: Platform Admin, Org Admin/Manager, Teacher, Student, Guardian, and Support/Audit.
2. Replace free-form `SharedCouncilMemory` with typed scenario context objects and deterministic fixture IDs.
3. Use accessible selectors first: roles, labels, visible text, test IDs only when accessibility cannot express the target, and coordinates only as diagnostic fallback.
4. Capture browser evidence: console errors, failed network responses, screenshots, traces or videos where supported, viewport size, authenticated role, and route.
5. Pair browser assertions with Supabase/RLS assertions for every security-sensitive outcome.
6. Treat auto-fix ideas as remediation notes. Do not modify product code from a test report unless a separate council document or user request authorizes that implementation.
7. Keep existing gates: `npm run verify`, real-Supabase E2E, RLS/SQL tests, browser harness, and PR review are complementary.
8. Do not test fictional features. LTI, SCORM, Turnitin, Zoom, PDF annotation, or timer behavior can be added only if current code supports them or a separate feature decision creates them.
9. Use the seeded test identities and routes that already exist unless the implementation proves they are insufficient.
10. Keep generated screenshots, traces, videos, reports, and temporary auth state out of version control.
11. Browser specs must distinguish expected denial responses from unexpected application failures in both assertions and report output.

---

## Decision

Build a repo-native multi-actor browser verification harness for ChurchCore LMS.

The harness will run scripted browser journeys for key personas, share typed scenario state across actors, record runtime evidence, verify security-sensitive outcomes in Supabase, and emit a Markdown report that can be attached to factory runs and PRs.

The first implementation is intentionally narrow:

- introduce or configure one browser automation runner
- seed or authenticate stable test personas
- cover one full teacher-to-student-to-teacher-to-guardian loop
- cover key denial paths
- generate a report
- integrate as an explicit script without weakening current test gates

---

## Implementation Mandate

### Runner

Preferred runner: Playwright.

Rationale: Playwright supports multi-browser contexts, role-based sessions, network/console capture, screenshots, traces, video, accessibility-friendly locators, and deterministic CI execution.

The council accepts Playwright for implementation unless the implementer finds a concrete blocker during setup. If a different runner is chosen, document the reason before changing `package.json`.

Configure the runner with one of these repeatable modes:

- local/CI managed server: Playwright `webServer` starts `npm run dev` or a production build/start pair on a deterministic port
- external server: `TEST_BASE_URL` is required and the runner fails fast if it is missing

Do not depend on a manually opened browser session.

### Proposed Files

- `playwright.config.ts` (new, if Playwright is selected)
- `tests/browser/fixtures/personas.ts`
- `tests/browser/fixtures/scenario-context.ts`
- `tests/browser/helpers/auth.ts`
- `tests/browser/helpers/evidence.ts`
- `tests/browser/helpers/report.ts`
- `tests/browser/helpers/database.ts` (Node-only setup/assertions; never imported by browser bundles)
- `tests/browser/specs/multi-actor-learning-loop.spec.ts`
- `tests/browser/specs/auth-and-isolation.spec.ts`
- `.ai-factory/templates/browser-test-report.md` or `tests/browser/report-template.md`
- `.gitignore` updates for browser artifacts and auth state
- `package.json` scripts:
  - `test:browser`
  - optionally `test:browser:headed`

### Existing Route Anchors

The initial browser suite must anchor to current product surfaces:

- Login: `/login`
- Dashboard: `/dashboard`
- Course detail: `/courses/[id]`
- Learner view: `/courses/[id]/learn`
- Staff submissions: `/courses/[id]/submissions`
- Staff gradebook grid: `/courses/[id]/gradebook`
- Guardian list/detail: `/guardian`, `/guardian/[studentId]`
- Admin health or settings: `/admin/health` or `/admin/settings`
- Platform feedback or audit: `/platform/feedback`, `/platform/audit` only if platform-admin auth is established

Do not invent routes in the browser harness.

### Seeded Test Identities

Use the existing seeded identities from `supabase/seed.test.sql` and `TEST_USER_PASSWORD`:

| Persona | Email | UID |
| --- | --- | --- |
| Org Admin A | `admin@test.churchcore.dev` | `00000000-0000-0000-0002-000000000001` |
| Teacher A | `teacher@test.churchcore.dev` | `00000000-0000-0000-0002-000000000002` |
| Student A | `student@test.churchcore.dev` | `00000000-0000-0000-0002-000000000003` |
| Admin B | `admin-b@test.churchcore.dev` | `00000000-0000-0000-0002-000000000004` |
| Student B | `student-b@test.churchcore.dev` | `00000000-0000-0000-0002-000000000005` |
| Guardian A | `guardian@test.churchcore.dev` | `00000000-0000-0000-0002-000000000006` |

Known seeded courses:

- Course A: `00000000-0000-0000-0011-000000000001`
- Course B: `00000000-0000-0000-0011-000000000002`

Guardian A is linked to Student A in the seed data. Student B is a useful cross-org denial actor.

### Persona Mapping

| V2 Persona | ChurchCore Role | Primary Purpose |
| --- | --- | --- |
| Platform Admin | platform admin | platform feedback, tenant health, audit visibility |
| Org Admin/Manager | admin or manager | org settings, users, terms, courses, reports |
| Teacher | teacher | course content, submissions, gradebook |
| Student | student | enroll, learn, submit, view grades/certificates |
| Guardian | guardian | read-only student progress and feedback |
| Support/Audit | supported staff/admin flow | audit logs, impersonation-like troubleshooting only where code supports it |

### Scenario Context

Use typed state instead of an unbounded global object:

```ts
export interface BrowserScenarioContext {
  orgId: string
  courseId: string
  teacherUid: string
  studentUid: string
  guardianUid?: string
  assignmentBlockId?: string
  submissionId?: string
  evidenceDir: string
}
```

Each spec must create or resolve deterministic fixture data and clean up writes it owns. Existing seeded users and helper patterns from `src/tests/e2e/test-session.ts` should be reused where possible.

Use a dedicated browser fixture namespace for any new rows, for example deterministic UUIDs in a new `0080` namespace or timestamped test-owned titles. If a browser interaction cannot create the required prerequisite state reliably, the Node test runner may seed that prerequisite with the service role, but the browser must still exercise the user-facing action being verified.

### Selector Strategy

Use this priority order:

1. `getByRole()` with accessible name
2. `getByLabel()` or `getByPlaceholder()`
3. visible text scoped to a landmark/region/table
4. `data-testid` only when a stable accessible target is impractical
5. coordinate/bounding-box checks only for drag/drop, floating UI position, overlap, and screenshot diagnostics

Coordinates are never the primary strategy for normal buttons, links, fields, or form submissions.

### Evidence Capture

Every browser spec must capture:

- persona name and route
- viewport
- console errors, excluding known third-party noise by explicit allowlist only
- failed network responses with status >= 400, excluding expected denial assertions
- screenshot on failure
- trace/video if supported by the selected runner
- Supabase assertions for data writes and denial paths

Artifacts should be written under a generated directory such as `tests/browser/artifacts/` or `.ai-factory/runs/<run-id>/browser-artifacts/`, and that path must be ignored by git unless the user explicitly asks to preserve a specific report.

### Report Format

The harness emits Markdown:

```markdown
# ChurchCore LMS Multi-Actor Browser Verification Report

**Timestamp:** ISO-8601
**Branch:** git branch
**Commit:** git sha
**Base URL:** url
**Total Scenarios:** n
**Result:** PASS | FAIL

## Persona Results
- Platform Admin: PASS | FAIL | NOT RUN
- Org Admin/Manager: PASS | FAIL | NOT RUN
- Teacher: PASS | FAIL | NOT RUN
- Student: PASS | FAIL | NOT RUN
- Guardian: PASS | FAIL | NOT RUN
- Support/Audit: PASS | FAIL | NOT RUN

## Scenario Evidence
### Scenario Name
- Personas:
- Routes:
- Browser Evidence:
- Database Assertions:
- Console/Network Findings:
- Artifacts:

## Detected Issues
### Severity - Title
- Triggering persona:
- Action attempted:
- Expected:
- Observed:
- Evidence:
- Suggested remediation:

## Unverified Areas
- Area:
- Reason:
- Follow-up:
```

---

## Implementation Prompt

You are implementing COUNCIL-2026-034 for ChurchCore LMS.

Read `CLAUDE.md`, `docs/CODE-FACTORY-SYSTEM-PROMPT.md`, `.ai-factory/rules/testing.md`, and the relevant existing E2E tests before editing. Preserve all unrelated dirty worktree changes. Do not weaken existing test gates.

Build a multi-actor browser verification harness that exercises one end-to-end ChurchCore LMS learning loop and core denial paths.

### Required Work

1. Choose and install a browser automation runner, preferably Playwright, unless current repo constraints make another runner clearly better. Document the choice in this council document or an adjacent implementation note.
2. Add `npm run test:browser` without changing the behavior of `npm run verify`, `npm run test:e2e`, or `npm run test:ci`.
3. Create browser fixtures for persona authentication and typed scenario context.
4. Implement evidence capture for console errors, failed network responses, screenshots on failure, and trace/video where supported.
5. Implement a Markdown report writer using the report format above.
6. Implement `multi-actor-learning-loop`:
   - Use Course A and the seeded Org A users unless implementation discovery proves a browser-owned fixture is safer.
   - Teacher A reaches `/courses/[courseId]/submissions` and `/courses/[courseId]/gradebook`.
   - Student A reaches `/courses/[courseId]/learn`.
   - The test verifies a supported student-visible learning/submission state. If Course A lacks a browser-submittable activity, seed one browser-owned assignment/submission prerequisite in Node setup, then continue through the visible staff and guardian surfaces.
   - Teacher A grades or verifies the student action in the gradebook/submissions surface.
   - Guardian A reaches `/guardian` and `/guardian/[studentUid]` and sees only Student A progress/grades.
   - Supabase assertions confirm the expected rows and no cross-tenant leakage.
7. Implement `auth-and-isolation`:
   - unauthenticated user is redirected from protected LMS routes
   - student cannot reach staff-only surfaces
   - guardian cannot mutate student/course data
   - Student B or Admin B cannot access Org A data
   - expected denials are recorded as pass conditions without hiding unexpected console/network failures
8. Prefer accessible locators. Add `data-testid` only where necessary and keep it narrowly scoped.
9. Keep tests deterministic and idempotent. Any generated rows must be cleaned up or isolated with timestamped/test-owned identifiers.
10. Run and report:
    - `npm run typecheck`
    - `npm run lint`
    - `npm run test:run`
    - `npm run test:e2e`
    - `npm run test:browser`

### Security Constraints

- No service role key in browser code.
- Node-only Playwright setup/teardown may use `TEST_SUPABASE_SERVICE_ROLE_KEY` for deterministic fixture setup and DB assertions; keep that code out of client bundles and browser page context.
- No PII in AI prompts or reports beyond deterministic test fixture identifiers already used by the test environment.
- Browser success does not prove RLS. Pair every security-sensitive browser assertion with a Supabase assertion.
- Expected 401/403/404 responses must be recorded as expected denials, not report failures.
- Do not add test users with hardcoded real credentials. Use existing env-var patterns.

### Out of Scope

- building new LMS product features
- adding LTI, SCORM, Turnitin, Zoom, quiz timers, PDF annotation, or impersonation if not already supported
- automatically editing product code based on the generated report
- changing branch protection or CI requirements
- replacing existing E2E/RLS tests

---

## Definition of Done

- [x] Council document ratified or explicitly approved for implementation.
- [x] Browser runner selected and dependency choice documented.
- [x] Browser server/base URL behavior documented and automated.
- [x] `npm run test:browser` added.
- [x] Persona fixtures and typed scenario context added.
- [x] Evidence capture records console, network, screenshots, and available traces/videos.
- [x] Browser artifacts/auth state ignored by git.
- [x] Markdown report emitted after browser run.
- [x] Multi-actor learning-loop scenario passes locally.
- [x] Auth and isolation scenario passes locally.
- [x] Supabase assertions verify security-sensitive outcomes.
- [x] No service role or secrets appear in browser-visible code.
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] `npm run test:run` passes.
- [x] `npm run test:e2e` passes or documented environment reason prevents execution.
- [x] `npm run test:browser` passes.
- [ ] PR review gate completed before merge.

---

## V2 Readiness Evaluation

**Readiness:** Implementation-ready after branch selection and dependency implementation.

**Strengths:**

- Aligned to ChurchCore LMS roles and current architecture.
- Keeps RLS and Supabase assertions as security source of truth.
- Converts the original prompt into deterministic, automatable browser tests.
- Adds reportable evidence suitable for `.ai-factory` runs and PR review.
- Avoids fictional feature coverage and prevents coordinate-first brittle tests.

**Remaining Risks:**

- Browser runner dependency is new and must be accepted deliberately.
- Auth fixture setup may need adjustment depending on current test seed users and env vars.
- Guardian and support/audit coverage must be limited to surfaces that actually exist in the current product.
- CI runtime may increase; browser tests should be a separate explicit gate at first.
- Current checkout is behind `origin/main` and has unrelated dirty worktree changes, so implementation should start from an intentional branch state.

**Go/No-Go:**

Go for creating an implementation branch from an intentional base and implementing this document.

No-go for direct implementation from the original pasted prompt.

No-go for installing browser dependencies into the current dirty checkout without first selecting the implementation branch/base.
