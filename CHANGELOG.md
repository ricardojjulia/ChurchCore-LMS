# Changelog

All notable changes to ChurchCore LMS are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.36.1] — 2026-09-25

### Fixed

- **Guardian notification emails were never sent.** The every-5-minute `guardian-notify` job calls `net.http_post()`, but the `pg_net` extension was never enabled in production. All 27,756 runs since 2026-06-21 failed. Enabling it also unblocks the weekly-digest schedule.
- **Release could not deploy the frontend.** The CI-side `vercel build` could not read the project's Sensitive variables. The release now uploads the approved commit and Vercel builds it.

---

## [0.36.0] — 2026-09-24

Closes every known defect from COUNCIL-2026-031 (COUNCIL-2026-033).

### Security

- **XP could be awarded by anyone.** `award_xp` was callable without signing in, and engagement events trusted the caller's XP amount. XP is now derived server-side from real blocks, quiz scores and completions.
- Anonymous visitors can no longer execute any `SECURITY DEFINER` function except the RLS helpers.
- Demo tenants no longer share a hard-coded password. Demo sign-in uses a one-time magic link, and the password is never stored or shown.
- `/api/digest` rejects requests when `CRON_SECRET` is unset instead of running unauthenticated.
- Releases build and deploy the exact approved commit (Vercel CLI) instead of a deploy hook that built the current `main`.

### Fixed

- PDF certificates, student reports and gradebook exports (upgrade to React 19).
- Large report exports no longer hang as "pending" forever.
- Weekly progress emails: the digest now reaches its summary endpoint, and students can turn it off on their profile.
- Certificate verification rejected every valid certificate.
- Staff opening a guardian's student page get redirected instead of a 404.
- Managers can post org-wide announcements.
- Accessibility: all remaining WCAG contrast, labelling, landmark and nested-control issues. The platform billing page was unreadable.

### Changed

- React 19; `@tremor/react` removed; `lucide-react` 0.577.
- Link prefetches no longer make an auth round trip in middleware.

---

## [0.35.0] — 2026-09-24

Full application test suite and release test-surface gate (COUNCIL-2026-031).

### Added

- **Browser and API test suite** (Playwright): it sweeps all 85 pages as every role, checking
  rendering, access denial, console errors and axe accessibility. It also runs API contract tests
  for every route and Edge Function, and end-to-end flows for learners, authoring, admin,
  the platform console, reports and messaging. It includes a mobile pass. `npm run test:suite:local`.
- **Test-surface gate** (`npm run test:surface`, in `verify` and CI): every page, API route,
  Server Action and Edge Function must be tagged by a test via `covers()`, or carry a dated exemption.
- **Production synthetic checks** after each release, run as an isolated `is_synthetic` tenant
  (`scripts/prod-synthetic-bootstrap.mjs`). Synthetic tenants cannot check out, and
  reserved-domain addresses are never emailed.
- `docs/testing.md` explains how to add tests for new features. PR template and council
  template gain a **Test surfaces** section.

### Fixed

- Messaging never worked (RLS recursion). Non-members could post into a thread by id.
- Learner progress was never saved. Assignment, quiz, video and discussion submissions failed.
  Bank-only quizzes could not be played.
- Many inserts failed without `org_id` (announcements, calendar, and others). `org_id` now
  defaults to the caller's organization.
- Attendance (self and teacher marking); cross-org `markStudentAttendance`.
- Drafts could not be published. Badges could not be managed. Cohort members never listed.
  Students could not add personal events. Content autosave could lose edits.
- `/join/[slug]` crashed. `/verify` was blocked for anonymous visitors. `/hq` and course
  analytics were not role-gated.
- Guardian emails never sent; unsubscribe broken.
- `content-images` and `reports` storage buckets created.
- CSP blocked Supabase realtime; accessibility contrast and labelling fixes.

### Security

- Open redirect in `/callback` (`next` parameter).
- Scheduled Edge Functions failed open without `CRON_SECRET`. `generate-embedding` and
  `generate-certificate` accepted the public anon key.
- Database error text is no longer returned to clients.
- The release deploys every Edge Function (previously two).

---

## [0.34.3] — 2026-09-24

Security hotfix (found while building the COUNCIL-2026-031 test suite).

### Security

- **Closed self-service privilege escalation and tenant hopping.** Any signed-in user could update their own `profiles.role` and `profiles.org_id` through the public API and become an admin of any organization. Users can now update only their personal profile fields (column-level grant).
- **Sign-up metadata no longer grants a role or organization.** New profiles take role and org only from server-controlled `app_metadata`. All trusted creation paths (join links, invites, bulk invite, tenant creation, demo reset) set it; changes to `app_metadata` now sync to the profile.
- **Admin user management is org-scoped.** Role and status changes, invites and deletions only affect users in the admin's own organization. Previously `deleteUser` could delete a user in any tenant, and invited users were created without an organization.

### Fixed

- Org admins can change user roles and status again. These silently did nothing, because RLS gave admins no way to update other users' profiles.

## [0.34.2] — 2026-09-23

### Fixed

- **Dashboard weekly AI summary** now calls Anthropic directly. It used to loop back through `/api/ai` without a user session, which only worked while that route was an open proxy; after the 0.34.1 security fix it would have returned "AI unavailable" for everyone. Provider network errors now return a clean 502 instead of an unhandled 500.

## [0.34.1] — 2026-09-23

Security hotfix (found while building the COUNCIL-2026-031 test suite).

### Security

- **Closed an unauthenticated Anthropic proxy at `POST /api/ai`.** The route forwarded any request body to Anthropic with the server's API key and no authentication (and with no rate limit when Upstash is unset). It now requires a signed-in admin/manager/teacher of an active organization, rate-limits per user, forwards only an allowlisted model with capped `max_tokens` and a bounded system prompt, returns 503 when AI is not configured, and no longer echoes upstream error bodies. HQ, its only caller, is unaffected.

## [0.34.0] — 2026-09-22

COUNCIL-2026-029 — Learning Paths / Discipleship Tracks (autonomous `.ai-factory` daily-loop run, 6/6 council approve).

### Added

- **Learning paths** — organizations can group existing courses into an ordered, opt-in sequence (e.g. "New Member Track," "Leadership Development Series") so learners see progression through a structured program instead of an unordered course list. Admins/managers create and manage paths (draft/published, reorder courses, add/remove) at `/admin/paths`; learners see their org's published paths and per-course completion progress at `/paths`. Path progress is derived from `course_certificates` at query time — no new enrollment/progress table.

---

## [0.33.0] — 2026-09-22

COUNCIL-2026-030 (numbered 030, not 029 — 029 was independently used the same day by a concurrent `.ai-factory` daily-loop run for an unrelated Learning Paths feature on a separate branch).

### Added

- **Holistic gradebook grid** — a per-course grid at `/courses/[id]/gradebook` lets a teacher see and grade every active student × every published assignment/quiz block in one screen, instead of expanding submission cards one at a time (Council Review 3's #1-ranked competitive gap). Supports grading a student who never submitted (e.g. an in-person assessment) directly from the grid, and CSV export of the current grid state.

### Security

- **Fixed a pre-existing authorization gap**: the `"block_submissions: staff grade own org"` RLS policy checked only org membership and role, not course ownership — any teacher in an organization could grade any other teacher's course submissions. Restored the course-ownership check for the `teacher` role (`admin`/`manager` remain org-wide, matching existing precedent elsewhere in the app), and added the same check at the application layer in both the new grid's `setGradeCell()` and the existing `gradeSubmission()`.

### Fixed

- **Fixed a live production bug in grading's side effects**: `gradeSubmission()`'s in-app notification insert omitted `org_id`, a `NOT NULL` column with no default — every grade submitted through the existing Submissions page threw an uncaught exception immediately after the grade itself saved, silently breaking the guardian-notification-queue insert and optional grading email for every teacher who ever graded a submission. The grading side effects (XP award, notification, email, guardian queue) were extracted into a shared `applyGradeSideEffects()` helper, used by both the old and new grading paths, with the `org_id` fix applied once for both.

---

## [0.32.0] — 2026-09-21

COUNCIL-2026-028 (relocated/renumbered from a root-level, misnumbered doc during PR #15 review — see docs/council/COUNCIL-2026-028.md for the full history).

### Added

- **Public certificate verification page** — a public, unauthenticated page at `/verify/[certNo]` lets anyone (an employer, a pastor, a congregation) verify a completion certificate's authenticity without logging in, showing learner name, course, organization, and issue date. A "Share verification link" button on `/certificates` and the post-completion page copies the verification URL to the clipboard, with a graceful new-tab fallback if the Clipboard API is unavailable.

### Security

- **Public scope is limited to non-sensitive fields only** — the verification query never selects `final_grade` or `letter_grade`; grades are educational records and were never approved for exposure on this unauthenticated surface (caught and fixed during PR review, before this ever shipped to a real user). The service-role read bypasses RLS by design, same as the existing `/join/[slug]` pattern — the security boundary here is the query's own field whitelist, not RLS.

---

## [0.31.0] — 2026-09-20

Council Review 3's #2-ranked competitive gap (COUNCIL-2026-027).

### Added

- **Public course catalog / unauthenticated preview pages** — orgs can now let a prospective member browse a course's title, description, and curriculum outline (module/block titles only, never content) with no account, at `/join/[slug]/courses` and `/join/[slug]/courses/[courseId]`. Opt-in per course (`is_public_preview`, default `false`), toggleable only by an org admin or manager and only once the course is `published`, enforced atomically by a DB `CHECK` constraint. A course that doesn't exist, isn't previewable, isn't published, or belongs to an inactive org all return an identical 404 — never a distinguishing signal.

### Security

- **Column-level grants added alongside RLS for the new anon-facing surface** — the blanket `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon` from `20260914154000` means RLS alone would not stop a direct PostgREST call from requesting `course_blocks.content` on a row its own policy allows. The new migration `REVOKE`s and re-`GRANT`s column-level `SELECT` to `anon` on `courses` and `course_blocks`, naming only the columns safe for public exposure — verified with a real anon-keyed regression test asserting a column-permission error, not an empty result.
- **Fixed pre-existing infinite-recursion bug in `organizations`/`org_members` RLS**, discovered while implementing the above: two legacy self-referential policies (predating `profile_roles` as the RLS hot-path table) meant every query against `organizations` under RLS — for any role, including `anon` — has always raised `infinite recursion detected in policy for relation "org_members"`. This silently broke the already-shipped `"organizations: anon read active"` anon policy for every real caller since it was written; never noticed because the only existing anon-facing route (`/join/[slug]`) uses `createServiceClient()`, bypassing RLS. Fixed by dropping both legacy policies — confirmed to remove no live functionality (`org_members` is queried nowhere in application code) and superseded by the existing `"organizations: members read own"` policy.

---

## [0.30.0] — 2026-09-20

Council Review 3's #1-ranked competitive gap (COUNCIL-2026-026).

### Added

- **Automated enrollment on registration** — new students joining via `/join/[slug]` previously landed on a completely empty `/dashboard` with no course access and required manual enrollment by an admin. Org admins can now opt courses into auto-enrollment for new joiners (`/admin/settings`, capped at 10 courses), gated through the same `enrollCore()` checks (`enrollment_type`, prerequisite, age, level) as any other enrollment — a gated course is silently skipped, never blocking registration.
- `src/lib/enrollment-core.ts` — `enrollCore()`, the shared enrollment-gating logic extracted from `enrollSelf()` so it's callable from both the session-bound Server Action and the service-client (no-session) registration path.

### Fixed

- **`enrollSelf()` NOT NULL constraint violation on `org_id`** — a genuine, previously-undetected live bug found while investigating the above: every real call to `enrollSelf()` threw a database constraint violation, because the insert never set the `NOT NULL` `org_id` column and no trigger filled it. Invisible because the unit test suite fully mocks Supabase (can't enforce real column constraints) and no e2e test exercised `enrollSelf()` against a real database. Fixed at the schema layer with a `BEFORE INSERT` trigger (`stamp_enrollment_org_id`) so the fix covers every insert path, not just the new registration one — verified with a real e2e regression test that fails without the trigger and passes with it.
- **Cross-org course validation in `addAutoEnrollCourse`** — caught in pre-merge review: adding a course ID that belonged to a different org would have silently pointed every future registrant's real enrollment at a foreign org's course. Now validated before write.

---

## [0.29.1] — 2026-09-19

### Security

- Pin transitive dependency `fast-uri` (via `ajv`/webpack/workbox) to exactly `3.1.8` in `package.json` overrides, closing 5 Dependabot high-severity advisories (host confusion / SSRF via URI normalization, CVE-2026-75931/76172/75975/75899/18446). The version had regressed to the vulnerable `3.1.4` (fixed upstream in `fast-uri` 3.1.5-3.1.6) as a side effect of merging an older Dependabot bump (`3.1.2`→`3.1.4`, itself predating the later patches) alongside this session's own branch — this pin makes the intended version explicit and unambiguous, and prevents either source from silently regressing it again. `npm audit` reports 0 vulnerabilities.

---

## [0.29.0] — 2026-09-19

Fixes from Council Review 3's implementation prompts (bug/reliability fixes only — competitive/feature gaps from that review were explicitly held back for a product decision).

### Fixed

- **Broken `/auth/login` redirects** — 35 files called `redirect('/auth/login')` (a route that doesn't exist; the real login page is `/login`), 404ing instead of redirecting unauthenticated users. Fixed globally; `middleware.ts` was already correct.
- **Guardian notification delivery silently marked "sent" on failure** (ADR-2026-010) — `send-guardian-notifications` previously set `sent_at` on every queue row regardless of whether the Resend call actually succeeded, with failures only logged to console. Now tracks real failures per row: up to 3 retries with backoff, then dead-lettered (`failed_at`) rather than silently disappearing. `guardian_notification_queue` gains `attempt_count`/`last_error`/`failed_at` and platform-admin read access (previously zero authenticated-role access existed on this table).
- **`stripe_customer_id` never written** — every org's Stripe billing portal request failed with "No active subscription" regardless of actual subscription status, because no code path ever persisted `organizations.stripe_customer_id`. Now written synchronously at checkout-session creation (reusing an existing customer on retry instead of minting duplicates), with the webhook as an idempotent safety net.
- **Missing `loading.tsx`/`error.tsx`** for `/platform`, `/guardian`, `/hq` — blank screens on slow connections and raw framework error pages instead of the app's error boundary pattern.
- **No print stylesheet** — certificates and reports rendered nav chrome, dark backgrounds, and interactive buttons as-is under browser print. Added a `@media print` block plus `.no-print` on shell nav, report filters, and certificate/report action rows.
- **`/admin/question-banks/new` dead link** — button existed with no page behind it; the server action (`upsertQuestionBank`) already existed, only the page and form were missing.

### Investigated, not changed

- Two prior council-audit claims (`profile_roles.tenant_active` staleness, platform-admin bootstrap) and one from this round (OneRoster partial-failure rollback in `apply_oneroster_job`) were checked against the actual code and found to already be correct — the sync function is properly called from `platform/actions.ts`, the bootstrap is CLAUDE.md's deliberate design, and the OneRoster apply function already isolates each row in its own subtransaction. No fix applied where none was needed.

---

## [0.28.1] — 2026-09-19

### Fixed

- **Feedback submission race condition** (COUNCIL-2026-023) — `POST /api/feedback`'s dedupe path was a SELECT-then-branch, so two concurrent submissions with the same fingerprint could both observe no existing row and race into the `fingerprint` UNIQUE constraint, silently losing the loser's report (previously masked by 201 responses that didn't check write errors). Replaced with `upsert_platform_feedback()`, a single atomic `INSERT ... ON CONFLICT DO UPDATE` Postgres function, verified race-free directly against a local database.
- **Feedback triage table keyboard accessibility** — the detail-drawer row in `/platform/feedback` was only openable by mouse click; added `tabIndex`, `role="button"`, an `aria-label`, and Enter/Space keyboard activation.

---

## [0.28.0] — 2026-09-19

### Added

- **Cookie-based i18n — English / Spanish** (COUNCIL-2026-024) — full EN/ES translation for all student- and parent/guardian-facing UI; locale stored in `NEXT_LOCALE` cookie (no URL segments), default `en`
- `messages/en.json` and `messages/es.json` — 508 ICU-format message keys covering courses, learning player, assignments, quiz, discussion, live session, attendance, certificates, calendar, announcements, reports, groups, messages, profile, notifications, leaderboard, onboarding, guardian, performance, join, offline, and all shared layout strings
- `src/i18n/request.ts` — `getRequestConfig` reads `NEXT_LOCALE` cookie server-side, loads the matching message bundle
- `src/components/layout/LocaleSwitcher.tsx` — EN/ES toggle button, with an icon-only variant when the sidebar is collapsed; sets `NEXT_LOCALE` cookie and calls `router.refresh()` to reload locale without a full navigation; mounted inside `SidebarClient`
- `NextIntlClientProvider` added to root layout wrapping body; `getMessages()` + `getLocale()` passed from server; `<html lang={locale}>` kept in sync
- `next.config.mjs` updated to wrap config with `createNextIntlPlugin`

### Changed

- All student/guardian-facing pages and client components now use `getTranslations()` (Server Components) or `useTranslations()` (Client Components) — hardcoded strings fully removed from the in-scope surface
- `EnrollmentTable` converted to `async` Server Component to support `getTranslations()`
- `BlockPlayer` gained an explicit `'use client'` directive (was already in a client tree; directive required for `useTranslations()` hook)
- Static label objects (`ROLE_LABELS`, `CATEGORIES`, `PROVIDER_LABEL`, `STATUS_META`, `PRIORITY_STYLE`) that contained hardcoded strings were refactored: values-only arrays or inline ternary `t()` calls replace them
- `CalendarView` month/weekday names now derive from `Intl.DateTimeFormat` for the active locale instead of static English arrays

### Scope

- Phase 1 covers student/learner/guardian-facing only. Admin (`src/app/admin/`), platform (`src/app/platform/`), HQ (`src/app/hq/`), instructor reports, and `MobileAdminDrawer.tsx` are NOT translated (Phase 2 follow-up). Middleware (`src/middleware.ts`) is unchanged.

---

## [0.27.0] — 2026-09-18

### Added

- **Pilot Feedback & Error-Triage System** (COUNCIL-2026-025) — in-product feedback capture and automatic error reporting for pilot/demo sessions, feature-gated behind `NEXT_PUBLIC_DEMO_MODE` (server-enforced, not just client-hidden)
- `platform_feedback` table — platform-plane only, RLS restricted to `is_platform_admin()` reads/updates and `service_role` writes; server-derived identity and SHA-256 dedupe fingerprint; upsert-on-conflict increments `hit_count` and reopens previously-triaged rows
- `POST /api/feedback` — the one submission endpoint; validates and bounds every field, rate-limited via a new `feedbackLimiter` (Upstash-backed, 20/60s per session)
- `FeedbackSessionProvider` / `FeedbackButton` — SSR-safe session context (sessionStorage UUID, last-5-route breadcrumbs, elapsed duration) and a fixed-position feedback button (BUG / ERROR / UNEXPECTED_RESULT / IMPROVEMENT), both fully inert when the gate is off
- `src/app/error.tsx` now reports unhandled render errors automatically when the gate is on (capped `error.message` only — never `error.stack` or `error.digest`), swallowing its own reporting failures
- `/platform/feedback` — staff triage workspace: open/done/all views, category/identity/date filters, unprocessed-first sort, detail drawer, optimistic triage-action and processed updates
- `.claude/agents/pr-reviewer.md` + `.claude/skills/pr-review/SKILL.md` — a PR review gate (Critical/Important/Minor) that runs on every PR, including changes small enough to skip the full council/factory pipeline

---

## [0.26.6] — 2026-09-19

### Fixed

- Verify an accepted Vercel deploy-hook release through its commit-scoped Vercel status, rather than a GitHub Deployment record that deploy hooks do not create. The verifier still requires a post-trigger Vercel URL and fails on an explicit Vercel failure.

---

## [0.26.5] — 2026-09-18

### Fixed

- Enforce configured group capacity in Postgres for direct inserts, member moves and reduced limits, including competing requests for the last place (COUNCIL-2026-022).
- Return a fixed capacity message to staff without exposing database details; retain duplicate-member errors and unlimited groups.
- Bind the membership-role SQL test to its own fixture instead of an arbitrary group from another tenant.
- Remove an invalid empty E2E workflow dependency list; CI and E2E remain independent checks.

### Verification

- Add transactional capacity regressions and CI concurrency checks under READ COMMITTED and REPEATABLE READ. Existing over-capacity groups retain their members; removal and role edits remain available.

---

## [0.26.4] — 2026-09-17

### Security

- Remove legacy content and embedding policies that bypassed tenant restrictions. Scope group, tutor and related-concept reads to active tenants and the authenticated actor.
- Bind discussion authors and thread relationships at the database boundary; validate group actions and redact database errors.
- Update Next.js to 16.3.5, TipTap to 3.31.3 and Vitest to 4.1.11, plus compatible transitive security fixes. The current lockfile audit reports zero vulnerabilities.

### Fixed

- Preserve platform-admin group reads while retaining existing mutation checks and ordinary tenant boundaries (COUNCIL-2026-021).
- Validate the section before removing a group member, redact lookup errors, and name the new-thread title and reply fields for assistive technology.
- Preserve date-only term boundaries in the Terms and Section screens regardless of server timezone.
- Send unauthenticated System Health requests to the canonical `/login` page and verify it against the production build.
- Resolve Auth IDs correctly for group membership, replies, active sections and tutor context while retaining distinct domain profile IDs.
- Render My Groups safely, display new threads and replies immediately, and fit discussion pages on mobile screens.
- Initialize the discussion editor after hydration and treat initial text as text rather than HTML.
- Extract TipTap text once per text node and include newly enrolled learners in published-page access.

### Verification

- Repair eight inherited SQL suites with transactional fixtures and actual role/constraint checks; add tenant-boundary regressions and group-action unit tests.
- Run the full database suite in the disposable E2E CI environment before API tests. Preserve existing coverage gates and add an 80% group-action line threshold.
- Refresh README, testing guidance, MVP status and OneRoster progress without claiming Academy integration complete.

---

## [0.26.3] - 2026-09-16

### Fixed

- Production app deployment now runs through a reviewed Vercel deploy hook only after approved Supabase migrations and Edge Functions succeed.
- The release verifies Vercel's GitHub deployment status before reporting success.

---

## [0.26.2] — 2026-09-15

### Fixed

- Release access tokens are available only to validation and Supabase deployment steps.
- Canonical factory release guidance now matches the actual environment secrets, approval placement, migration order, CLI pin, and required check names.
- Releases are serialized, stale production promotions are rejected, and both Supabase targets must match their reviewed project references before mutation.

### Documentation

- Clarified temporary database login credentials and multiple-function support in the pinned Supabase CLI.

---

## [0.26.1] — 2026-09-15

### Fixed

- Release jobs report missing Supabase project references and access tokens before invoking the CLI, without exposing their values.
- Production deployment uses the production environment's credentials and approval rules on the actual deployment job.
- Production migrations run after environment approval and before production Edge Functions.
- Supabase release commands quote project references and pin the verified CLI version; staging migration push runs non-interactively.

### Documentation

- Documented environment-scoped deployment tokens, staging assignment, and failed-release recovery.
- Added the OpenAPI-first REST contract and optional Swagger UI to the M5 OneRoster plan.

---

## [0.26.0] — 2026-09-14

### Added

- **Signed OneRoster Delivery** (COUNCIL-2026-019) — tenant-scoped ChurchCore Academy connections accept Ed25519-signed ZIP deliveries, enforce timestamp and replay protection, and stage packages for explicit admin review
- OneRoster connection and delivery-status admin view with public-key configuration, expected cadence, copyable endpoint, immutable attempt history, and received-job review actions
- `oneroster_transport_attempts` audit ledger, scheduled package idempotency, active-tenant RLS, service-role insert-only grants, and pgTAP coverage

### Changed

- Manual uploads and signed deliveries now share one redacted validate-and-stage path
- CI can run as both a normal workflow and the reusable prerequisite for the gated release workflow

### Security

- Signed receipt never applies roster changes or provisions Auth users; LMS stores public verification material only, and invalid signatures are rejected before attacker-controlled metadata is persisted

---

## [0.25.1] — 2026-06-22

### Added

- **Community Leaderboard** (COUNCIL-2026-015) — top-10 XP ranking visible on learner and instructor dashboards
- `get_leaderboard(p_limit)` SECURITY DEFINER Postgres function — `DENSE_RANK()` for correct tie handling; scoped to `current_user_org_id()` via `profile_roles` JOIN; `tenant_active = true` filter; guardians excluded; current learner's row always included (UNION outside top-N)
- `Leaderboard` server component — rank medals (🥇🥈🥉), initials avatars, XP + level columns; current user row highlighted with left-border and `(you)` label; "· · ·" separator shown if learner is outside top 10; "You're #1!" badge for the leader; returns `null` if org has no data (graceful empty)
- `CREATE INDEX IF NOT EXISTS idx_profiles_xp ON profiles(xp_points DESC)` — fast leaderboard sort

---

## [0.25.0] — 2026-06-22

### Added

- **Question Banks** (COUNCIL-2026-011) — reusable question pools with per-attempt random draws
- `question_banks` and `bank_questions` tables with RLS (teachers can read; admin/manager can write; cross-org access blocked)
- `draw_from_bank(p_bank_id, p_count)` SECURITY DEFINER Postgres RPC — `ORDER BY random()`, validates org ownership before drawing, returns only question content JSONB
- `/admin/question-banks` list page — name, description, question count, delete
- `/admin/question-banks/[id]` detail page — create/edit bank metadata; add questions of all four types (MC, T/F, matching, fill-blank); remove individual questions
- Quiz builder (QuizForm) now has a "Draw from Bank" section — select a bank + count, add multiple draws; bank draws serialised into `content.bank_draws` JSONB
- `loadQuizQuestions` server action — resolves `bank_draws` at quiz load time via `draw_from_bank` RPC, Fisher-Yates shuffles static + drawn questions, returns merged list to client
- QuizPlayer resolves bank draws on mount (shows "Preparing quiz…" spinner); falls back to static questions if bank is empty

---

## [0.24.3] — 2026-06-22

### Added

- **Quiz Extended Types** (COUNCIL-2026-010) — two new question types and a countdown timer
- **Matching questions** — pairs editor in course builder (left/right columns); player renders right-side options shuffled per session in dropdowns; all-or-nothing scoring
- **Fill-in-the-blank questions** — template editor with `[blank]` placeholders auto-derives blank slots; per-blank acceptable answers (comma-separated, case-insensitive); player renders inline text inputs within the sentence; all-or-nothing scoring
- **Quiz timer** — `time_limit_minutes` now active in the player; countdown displayed with urgency styling under 60 s; persisted in `localStorage` across page reloads; auto-submits on expiry with partial answers
- `submitQuiz` server action extended to grade `matching` (compares matched pair IDs) and `fill_blank` (case-insensitive acceptable_answers match) in addition to existing `multiple_choice`/`true_false` logic

---

## [0.24.2] — 2026-06-22

### Added

- **AI Outline Generator** (COUNCIL-2026-014) — teachers click "✨ AI" in the course builder sidebar to open a modal; paste curriculum text or upload a PDF (≤ 5 MB); AI (claude-sonnet-4-6) returns a structured outline with modules and blocks; preview shows collapsible module list; "Accept & Build" creates all `course_blocks` rows via `createCourseFromOutline` server action; rate-limited to 5 requests/hour/user via Upstash
- `POST /api/ai/outline-generator` — auth + role check + rate limit + base64 PDF support via Anthropic document API; no org/user PII in prompt
- `outlineLimiter` added to `src/lib/rate-limit.ts` (5 req / 3600s)

---

## [0.24.1] — 2026-06-22

### Added

- **Badge Auto-Triggers** (COUNCIL-2026-012) — `badges.trigger_condition` JSONB and `is_auto_awarded` columns; `evaluate_badge_triggers()` SECURITY DEFINER Postgres function evaluates `xp_threshold`, `course_completion`, `streak`, and `block_count` trigger types; hooked into `record_engagement_event()` so badges fire atomically with each engagement event; ON CONFLICT DO NOTHING ensures idempotency; in-app notification inserted on award
- `/admin/badges` management page — create, edit, delete badges; trigger type + threshold configuration UI
- `upsertBadge` and `deleteBadge` server actions with role + org ownership checks

---

## [0.24.0] — 2026-06-22

### Added

- **Drag-and-Drop Course Builder** (COUNCIL-2026-009) — blocks in the course builder can be reordered by dragging; `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` added; keyboard drag mode supported natively; move-up/move-down arrow buttons retained as fallback; optimistic UI with error revert and save status indicator
- `reorderCourseBlocks` server action validates caller role + org ownership + all block IDs belong to the course before updating `sort_order` via service client

---

## [0.23.3] — 2026-06-22

### Added

- **Focus Mode** (COUNCIL-2026-013) — `F` keyboard shortcut or fixed bottom-right toggle button hides the course sidebar and sidebar toggle; preference persisted in localStorage and restored on refresh; `useFocusMode` hook in `src/hooks/useFocusMode.ts`; `FocusModeToggle` component in `src/components/ui/FocusModeToggle.tsx`; `F` key no-ops when an input or textarea is focused

---

## [0.23.2] — 2026-06-22

### Added

- **PDF Certificate Download** (COUNCIL-2026-008) — `GET /api/certificates/[id]/pdf` generates a formal A4-landscape PDF on-demand via `@react-pdf/renderer`; no PDF stored in Supabase Storage; authenticated via `getUser()` + RLS; `Content-Disposition: attachment` triggers native browser download
- `CertificateDocument` React PDF component (`src/components/pdf/CertificateDocument.tsx`) renders learner name, course title, org name, issued date, certificate number, and grade (omitted when null)
- "Download PDF" link added to each certificate card on `/certificates` page

---

## [0.23.1] — 2026-06-22

### Added

- **Teacher Plug Module** (COUNCIL-2026-007) — new `teacher_plug` block type; instructors can insert a personal card into any course with name, photo, bio override, specialties, and a website link; `TeacherPlugForm` auto-fills from the author's profile; `TeacherPlugPlayer` fetches the live profile by `teacher_uid`, verifies org isolation, and renders with signed avatar URL (private bucket)
- `profiles` table extended with `bio TEXT`, `specialty TEXT[]`, and `website_url TEXT` columns (migration `20260622110000`)

### Changed

- `ContentBlockTypeId` union extended with `'teacher_plug'`; `BLOCK_TYPE_META` record updated accordingly
- `BlockPlayer` accepts an optional `orgId` prop (threaded from `LearningShell` ← `learn/page.tsx`); required for `teacher_plug` org-isolation check
- `LearningShell` and `learn/page.tsx` updated to fetch and pass `course.org_id`

---

## [0.23.0] — 2026-06-22

### Added

- **Engagement Tracker + Ledger** (COUNCIL-2026-006) — immutable `engagement_events` log and `engagement_streaks` table; `record_engagement_event()` SECURITY DEFINER RPC atomically records events, awards XP, and updates daily streaks; `EngagementWidget` on student dashboard shows total XP, current streak, and last 5 activities; admin member detail page at `/admin/users/[id]` with engagement view; "View engagement →" link added to `UserRow`
- `recordEngagement` server action wrapping the RPC for client-component use
- Block completions, quiz submissions, and course completions now flow through the engagement ledger instead of direct `award_xp` calls — full audit trail from first install

### Changed

- `markBlockViewed` now calls `record_engagement_event('block_completion')` (10 XP default) instead of `tryAwardXp` directly; course completion 100 XP bonus routed through `record_engagement_event('course_completion')`
- `submitQuiz` now calls `record_engagement_event('quiz_pass')` with grade-scaled XP instead of `tryAwardXp`

---

## [0.22.1] — 2026-06-21

### Security

- **Middleware: `/join` and `/api/` excluded from auth redirect** (ADR-2026-003) — unauthenticated visitors can now reach `/join/[slug]` for self-registration; Stripe webhook POSTs to `/api/stripe/webhook` are no longer silently dropped as 302 redirects (critical pre-launch bug)
- **`AssignmentPlayer`: removed `getPublicUrl()` on private bucket** — `assignment-files` is `public = FALSE`; broken public-URL fallback replaced with a hard user-facing error on signed-URL failure
- **4 API routes: sanitized error messages** — `calendar`, `upload/image`, `analytics/events`, `ai/related-concepts` no longer return raw Supabase `error.message` to clients (was leaking constraint names, bucket paths, internal function names)
- **Digest route: removed PII from server logs** — `console.error` now logs `uid` instead of `email` on weekly digest send failures

### Fixed

- **`handle_new_user` trigger: explicit `::public.user_role` cast** (`20260621210000`) — JSONB `->>` yields `text`; inside a SECURITY DEFINER trigger Postgres does not apply the implicit assignment cast to the enum; caused every `supabase.auth.admin.createUser()` call to fail with "Database error creating new user"
- **`enforcement_enrollment_state_machine`: `org_id` added to audit INSERT** (`20260621220000`) — Phase 2 made `enrollment_audit_log.org_id` NOT NULL but the trigger predated that column; enrollment status transitions (pending → active, etc.) were failing
- **`reset-demo-data.mjs`: three fixes** — creates retained auth user if not found; adds `org_id` to all 16+ tables with Phase 2 NOT NULL; NULLs `profiles.org_id` before cleanup loop to avoid `profiles_org_id_fkey` FK violation on org delete
- **`platform_admins` bootstrap SQL**: corrected to include required `display_name` column

### Consistency (ADR-2026-003)

- **Organizations RLS policies** (`20260621230000`) — inline `id IN (SELECT org_id FROM profile_roles ...)` subqueries replaced with `current_user_org_id()` helper
- **Guardian SECURITY DEFINER functions** (`20260621230100`) — `get_guardian_students`, `get_guardian_student_overview`, `link_guardian_to_student`, `unlink_guardian_from_student` switched from `profiles` to `profile_roles` for caller UID/role; email lookup remains in `profiles` (only table with that column)
- **Embeddings RLS**: documented why `auth.uid()` is correct for `direct_enrollments.user_id` comparison (FK to `auth.users`, not `profiles.uid`)

### Code Quality

- **`learning.ts`**: removed 6 unnecessary `as any` casts — `email`, `display_name`, `current_level` were already in the select; direct field access used
- **`courses/[id]/page.tsx`**: `CourseRow` and `GamificationJSON` typed interfaces replace 12 `(course as any).xxx` casts
- **`messages/page.tsx`, `messages/[threadId]/page.tsx`**: `ThreadRow` and `ThreadInfo` interfaces replace bare `as any` thread casts
- **28 remaining `as any` casts**: all documented with `eslint-disable-next-line` and reason (Supabase join inference, JSONB shape, RPC return type, event type union); test file mocks exempt per ADR-2026-003

---

## [0.22.0] — 2026-06-21

### Added

- **Self-Serve Billing page** (COUNCIL-2026-003) — `/admin/billing` page for org admins: current plan display with feature list, "Manage Subscription & Invoices" button (Stripe Customer Portal redirect for paid plans), "Upgrade Plan" CTA (Stripe Checkout for free plans), suspension banner when `org.status = 'suspended'`; skeleton loading state
- **`/api/stripe/portal` route** — POST, admin-only; creates a Stripe Customer Portal session; returns single-use session URL; org_id derived from server session only; Stripe errors caught and genericised
- **`stripe_customer_id` migration** (`20260621100000_org_stripe_customer_id.sql`) — adds nullable `stripe_customer_id TEXT` to `organizations`; inherited by existing RLS policies
- **"Billing" nav item** — added to desktop sidebar (`SidebarClient`) and mobile admin drawer (`MobileAdminDrawer`) with `CreditCard` icon
- **PWA + Offline Player** (COUNCIL-2026-004) — `@ducanh2912/next-pwa` installed; `next.config.ts` wrapped with Workbox config that excludes `*.supabase.co` and `/api/*` from runtime caching; offline fallback routed to `/offline`
- **`public/manifest.json`** — full Web App Manifest: `display: standalone`, `start_url: /dashboard`, indigo (#4f46e5) theme, dark (#0f172a) background
- **PWA icons** — `public/icons/icon-192.png` and `public/icons/icon-512.png` generated via `scripts/generate-icons.js` (Node.js built-ins only, no external deps); confirmed valid PNG via `file` command
- **`/offline` page** — static fallback page with no auth requirement; used as Workbox document fallback when a user navigates to an uncached page while offline
- **`OfflineBanner` component** (`src/components/layout/OfflineBanner.tsx`) — `'use client'`; SSR-safe (initialises from `navigator.onLine` inside `useEffect`); renders amber banner with `aria-live="polite"` only when offline
- **Course layout** (`src/app/courses/[id]/layout.tsx`) — created; wraps all course player pages with `<OfflineBanner />`; scoped to course routes only (admin builder unaffected)
- **PWA meta tags** in `src/app/layout.tsx` — manifest link, theme-color, apple-mobile-web-app meta tags, apple-touch-icon
- **Graded Discussion Block** (COUNCIL-2026-005) — participation-based grading (one score per student per discussion block) added to `DiscussionPlayer`; teachers/admins see inline "Grade" button on each reply; clicking opens a score/max-score form; students see `"Grade: X / Y"` badge below their own post after grading
- **`gradeDiscussionSubmission` server action** (`src/app/actions/learning.ts`) — role check (admin/manager/teacher), numeric validation, cross-tenant guard (JOIN `block_submissions → course_blocks → courses` WHERE `org_id = callerOrgId`), `graded_by` set from server session only, status set to `'graded'`
- **`viewerRole` prop chain** — `learn/page.tsx` → `LearningShell` → `BlockPlayer` → `DiscussionPlayer`; `BlockPlayer` also passes `maxScore` from `block.content?.max_score ?? 10`
- **SW files excluded from git** — `public/sw.js` and `public/workbox-*.js` added to `.gitignore`

### Fixed

- **`BlockPlayer` stale comment** — "This content type is not yet interactive" comment removed from the `discussion` block case (was incorrect; `DiscussionPlayer` is fully interactive)

---

## [0.21.0] — 2026-06-21

### Added

- **Guardian Email Bridge** (COUNCIL-2026-001) — automatic email notifications to linked guardians on student course completion and badge award; 30-minute debounce prevents notification storms; default opt-in with per-guardian opt-out
- **`guardian_notification_queue` table** (`20260620100000_guardian_notification_queue.sql`) — RLS `USING (false)` for all authenticated (service role only); index on `(debounce_until, sent_at) WHERE sent_at IS NULL`
- **Guardian queue triggers** (SECURITY DEFINER) — `trg_guardian_notification_course_completion` (AFTER UPDATE OF status ON `course_enrollments` WHERE NEW.status = 'completed') and `trg_guardian_notification_badge` (AFTER INSERT ON `profile_badges`); both upsert-debounce into the queue
- **`send-guardian-notifications` Edge Function** (`supabase/functions/send-guardian-notifications/`) — Deno; auth via `CRON_SECRET` bearer token; processes up to 50 queue rows per invocation where `debounce_until < NOW() AND sent_at IS NULL`; builds HMAC-SHA256 unsubscribe JWT via Web Crypto API; sends via Resend; marks `sent_at = NOW()`
- **`GuardianCourseCompletionEmail` template** (`src/emails/GuardianCourseCompletionEmail.tsx`) — React Email; purple CTA; unsubscribe footer link
- **Guardian unsubscribe route** (`src/app/api/guardian/unsubscribe/route.ts`) — GET-only, `runtime = 'nodejs'`; verifies HMAC-SHA256 token with `timingSafeEqual`; updates `profiles.settings.notifications.guardian_emails = false` via service client using read-then-merge pattern to preserve other settings keys
- **pg_cron guardian job** — `guardian-notify` scheduled every 5 minutes via `cron.schedule` + `net.http_post`; registered with `scripts/register-guardian-cron.sh`
- **`supabase/config.toml`** — `[functions.send-guardian-notifications] verify_jwt = false` added
- **Bulk CSV User Import** (COUNCIL-2026-002) — `/admin/users/import` page; 3-step UI (upload → preview → done); supports CSV with columns: `email`, `display_name`, `role`; 50-row cap with clear error messaging; per-row error reporting; downloadable error CSV
- **`parse-csv.ts`** (`src/lib/parse-csv.ts`) — pure function, zero imports, browser-safe; case-insensitive headers; collects ALL row errors without short-circuiting; validates email format and role allow-list (`admin|manager|teacher|student|guardian`); `MAX_ROWS = 50`
- **`bulkInviteUsers` server action** — `org_id` from server session only; role allow-list validated server-side; `ilike` email duplicate check; calls GoTrue `inviteUserByEmail`; writes counts to `admin_audit_log` (no email addresses in log); returns per-row `BulkInviteResult[]`
- **`ImportForm` component** (`src/app/admin/users/import/ImportForm.tsx`) — `'use client'`; state machine (`upload | preview | done`); rate-limit warning banner; file input via styled label; error CSV download is pure client-side (`Blob` + `URL.createObjectURL`)
- **`.env.local.example`** — added `SUPABASE_JWT_SECRET` and `CRON_SECRET` documentation entries

---

## [0.20.2] — 2026-06-18

### Added

- **Reports navigation** (COUNCIL-2025-012) — `/reports` unified server-side redirect route reads authenticated user's role and redirects to `/student/reports`, `/instructor/reports`, or `/admin/reports`; unknown roles receive a graceful fallback message instead of a redirect loop
- **Reports sidebar item** — "Reports" with `BarChart2` icon added to the main nav section of the desktop sidebar (visible to all authenticated roles), positioned after Grades
- **Reports mobile tab** — mobile bottom nav Grades tab replaced with Reports tab; Grades remains accessible via desktop sidebar and `/performance`

---

## [0.20.1] — 2026-06-18

### Fixed

- **`system-health-check` Edge Function** — `embedding_jobs_stuck` and `embedding_jobs_failed_24h` checks referenced a non-existent `updated_at` column on `embedding_jobs`; both now use `created_at`, resolving the two persistent ❌ alerts in the health panel
- **`count_unsynced_bridge_enrollments` RPC** — added missing Postgres function (`supabase/migrations/20260618152000_count_unsynced_bridge_enrollments.sql`) that the health check called but was never defined; function joins `direct_enrollments → course_sections.blueprint_id → courses → enrollments` to count students in active section enrollments with no corresponding course enrollment; `orphaned_enrollments` health check now reports ⚠️ instead of ❓
- **Demo data consistency** — `scripts/reset-demo-data.mjs` set `profiles.uid` to a random UUID instead of the auth user's `id`; fixed to use `user.id` so that `direct_enrollments.user_id`, `enrollments.user_id`, `cohort_members.user_id`, and `profiles.uid` all share the same auth UUID — the bridge trigger (`trg_bridge_section_to_course`) now fires correctly on fresh demo resets

---

## [0.20.0] — 2026-06-16

### Added

- **Enrollment confirmation email** — `enrollSelf` now sends a transactional email via Resend when a student enrolls; includes course title and a direct "Start learning" link; silently skipped when `RESEND_API_KEY` is not set
- **Certificate issued email** — `markBlockViewed` captures the `issue_certificate` RPC result and emails the student their certificate number and final grade on course completion; silently skipped when `RESEND_API_KEY` is not set
- **Announcement course selector** — "Course members" scope in the new announcement form now renders a course `<select>` populated server-side with published courses; the `courseId` is passed to `createAnnouncement` and validated server-side; previously showed a "coming soon" placeholder

### Changed

- `src/app/announcements/new/page.tsx` — converted from a client component to a server component; fetches published courses and passes them to the extracted `NewAnnouncementForm`
- `src/app/announcements/new/NewAnnouncementForm.tsx` — extracted client form; adds `courses` prop and `courseId` state; clears `courseId` when scope changes

---

## [0.19.0] — 2026-06-16

### Added

- **`MobileAdminDrawer`** (G3) — floating "Admin" button fixed above the 5-tab bottom nav (`bottom-[72px] right-4 z-40 md:hidden`); opens a slide-in bottom sheet with links to `/admin/users`, `/admin/cohorts`, `/admin/sections`, `/admin/terms`, `/admin/blueprints`, `/admin/health`; ARIA `role="dialog" aria-modal="true"`; closes on Escape, backdrop click, or link navigation
- **`MobileAdminDrawerServer`** (G3) — server component that fetches `profile.role` and passes `isAdmin` prop to the client drawer; follows the same pattern as `MobileBottomNavServer`; rendered in `src/app/layout.tsx` below `<MobileBottomNavServer />`
- **Server action unit tests** (G1) — `src/app/actions/cohorts.test.ts`, `src/app/actions/messages.test.ts`, `src/app/actions/learning.test.ts`; Proxy-based `resolvesWith()` fluent mock chain allows awaiting at arbitrary chain depth; per-file coverage thresholds enforced in CI (`cohorts.ts` ≥ 40 %, `messages.ts` ≥ 35 %, `learning.ts` ≥ 28 %)
- **`next/cache` global mock** (G1) — `src/tests/setup.ts` now mocks `revalidatePath` and `revalidateTag` so action tests never hit the Next.js static generation store invariant
- **Edge Function staging deploy** (G4, G2) — `release.yml` rewritten with four jobs: `ci` (reuses `ci.yml`), `deploy-staging` (Supabase CLI db push + `functions deploy search-users` to staging project), `approve` (manual gate via `environment: production`), `deploy` (production functions deploy + Vercel wait + optional webhook)
- **Staging environment docs** (G4) — `docs/github-setup.md` extended with `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` secrets and a full "Staging Environment" section (project isolation, GitHub environment config, `STAGING_SUPABASE_PROJECT_REF`, pipeline order)
- **`search-users` E2E spec** (G4) — `src/tests/e2e/search-users.test.ts`; tests authenticated admin → 200 + `{id, full_name, email}` fields, no-auth header → 401, student role → 403
- **Version consistency check** (G0) — `scripts/check-version.mjs` enforces `package.json` version == leading CHANGELOG entry; `npm run version:check` added; CI step runs before lint

### Removed

- **Dead nav files** (G0) — `src/components/layout/Navbar.tsx` and `src/components/layout/NavLinks.tsx` deleted; replaced by `Sidebar` in v0.18.0 with no remaining external imports

### Changed

- **`vitest.config.ts`** — `src/app/actions/**` added to coverage includes; per-file thresholds added for three tested action files

---

## [0.18.0] — 2026-06-16

### Added

- **Collapsible side navigation** — replaces the top navbar with a fixed left rail that collapses to a 56 px icon-only mode and expands to 240 px with full labels; collapse preference persisted in `localStorage`; smooth `transition-[width]` CSS animation with `max-width + opacity` label fade (no `overflow: hidden` needed, so the notification panel is never clipped); accessible via `aria-label` on the toggle button
- **`SidebarContext`** — React context (`SidebarProvider` + `useSidebar` hook) owns the single source of truth for collapsed state and the `toggle()` mutation; exported from `src/components/layout/SidebarContext.tsx`
- **`SidebarClient`** — `'use client'` component rendering the full sidebar UI; nav links defined with Lucide icons (`LayoutDashboard`, `BookOpen`, `BarChart3`, `Award`, `Trophy`, `MessageCircle`, `Megaphone`, `Calendar`, `Users`, `Shield`, `Zap`, `UserCog`, `Layers`, `Clock`, `FileText`, `Sparkles`, `Activity`); links grouped into Main / Guardian / Staff / Admin sections with dividers; active state via `usePathname()`; badge counts float to the icon corner when collapsed
- **`Sidebar`** — server component that fetches user, profile, unread message count, and health error count (identical to old `Navbar` data fetching) then renders `SidebarClient`
- **`SidebarMain`** — `'use client'` content wrapper; reads `collapsed` from context and applies `md:pl-14` / `md:pl-60` with `transition-[padding-left] duration-200`; carries `id="main-content"` for skip-nav
- **`docs/HOWTO-sidebar-nav.md`** — customisation guide: adding links, icon choices, section grouping, persisting state to cookies instead of localStorage, and disabling the sidebar for specific routes
- **CI/CD pipeline** (`ADR-0014 R1`) — `.github/workflows/ci.yml` (lint → typecheck → unit tests → build, Node 24, npm cache); `.github/workflows/e2e.yml` (pull-request-only, Supabase CLI, migrations + seed); `.github/workflows/release.yml` (push-to-main, reuses CI, manual approval gate via `environment: production`, optional webhook notification); `.github/CODEOWNERS` — migrations, Edge Functions, CI workflows, and Supabase utils require `@churchcore/architects` review
- **Error boundaries** (`ADR-0014 R1`) — `src/app/error.tsx`, `src/app/admin/error.tsx`, `src/app/courses/error.tsx`, `src/app/courses/[id]/error.tsx`, `src/app/courses/[id]/learn/error.tsx`, `src/app/dashboard/error.tsx`; all `'use client'`, none expose `error.message` or `error.stack` in the DOM (only `error.digest`); `captureError()` called in `useEffect` for server-side logging
- **`src/lib/monitoring.ts`** — `captureError(error, context)` utility; generates an 8-char error ID; logs full error in development, ID-only in production; stub comment for Sentry integration
- **Test foundation** (`ADR-0014 R2`) — Vitest with `@testing-library/react`, `@testing-library/jest-dom`, per-directory coverage thresholds (`src/lib/**` ≥ 80 %, `src/hooks/**` ≥ 70 %, `src/utils/**` ≥ 80 %); 9 test files, 72 passing tests
- **`src/utils/supabase/__mocks__/client.ts`** — Vitest auto-mock with fluent query builder, `mockSupabaseResponse<T>()`, and `mockSupabaseError()` helpers
- **`src/tests/setup.ts`** — global test setup; mocks `next/navigation` (`useRouter`, `useParams`, `usePathname`, `redirect`), `@/utils/supabase/client`, and `@/utils/supabase/server`
- **`src/lib/auth/permissions.ts`** — `isAdmin`, `isStaff`, `isLearner`, `canAccessAdminRoutes`, `canManageCourses` helpers using `Set` for O(1) role lookup; fully unit-tested
- **`src/utils/grading.ts`** — `calculatePercentage` (returns 0 on division by zero), `calculateLetterGrade` (A/B/C/D/F), `isPassing` (configurable threshold, default 70 %); fully unit-tested
- **`src/utils/certificate.ts`** — `formatCompletionDate` (en-US long form), `generateCertificateData` (falls back to `'Unknown Recipient'` for null/empty/whitespace names); timezone-safe tests use noon-UTC fixture dates
- **Realtime hooks** (`ADR-0014 R3`) — `useRealtimeChannel` base hook (`src/hooks/useRealtimeChannel.ts`): `useRef<RealtimeChannel>` guarantees cleanup on unmount regardless of render order; `onData`/`onStatusChange` intentionally excluded from deps (callers use `useCallback`); `useNotifications` and `useMessages` built on top
- **`useNotifications`** (`src/hooks/useNotifications.ts`) — fetches + realtime-subscribes to `notifications`; exposes `unreadCount`, `markAsRead`, `markAllAsRead`, and `connectionStatus`; uses `is_read` field (not `read`)
- **`useMessages`** (`src/hooks/useMessages.ts`) — fetch + realtime for thread messages; exposes `isAtBottomRef` for scroll management
- **Realtime DB publications** (`ADR-0014 R3`) — migration `20240601000047`: idempotent `DO $$` block adding `notifications` and `messages` to the `supabase_realtime` publication
- **RLS audit migration** (`ADR-0014 R3`) — migration `20240601000048`: confirms existing RLS policies on `notifications` and `messages` (from migrations 023/024); no new conflicting policies added
- **User search Edge Function** (`ADR-0014 R4`) — `supabase/functions/search-users/index.ts`: JWT verification via user-scoped client; role check (admin/manager/teacher only, 403 otherwise); 2–100 char query validation; `ILIKE` on `display_name` and `email` with GIN trigram indexes; every successful search recorded in `admin_audit_log` via service role; returns `{ id, full_name, email, avatar_url }`
- **GIN search indexes + audit log** (`ADR-0014 R4`) — migration `20240601000049`: `pg_trgm` extension; `idx_profiles_display_name_trgm` and `idx_profiles_email_trgm`; `admin_audit_log` table with RLS (admin/manager SELECT, no client INSERT — service role only)
- **`UserSearchCombobox`** (`ADR-0014 R4`) — `src/components/cohorts/UserSearchCombobox.tsx`; combobox ARIA pattern (`role="combobox"` on input, `role="listbox"` / `role="option"` on results, `role="status"` / `role="alert"` on status items); 300 ms debounce; direct `fetch` to Edge Function (not `supabase.functions.invoke` — GET query params not supported via invoke); keyboard: ArrowUp/Down, Enter, Escape; filters existing members from results; "Invite them?" empty-state link
- **Cohort member search** (`ADR-0014 R4`) — `CohortMemberPanel` now embeds `UserSearchCombobox`; selecting a user calls `addCohortMember()` Server Action; success toast clears after 3 s
- **Course catalog track classification** (`COUNCIL-2025-007`) — courses page groups by program track (from `course_blueprints → program_tracks` join); track filter chips as `<Link href="?track=id">`; grouped `<h2>` sections; "Other" group sorts last; three-case empty state (no courses / no matches / track empty)
- **`CourseCard` blueprint code** (`COUNCIL-2025-007`) — `blueprintCode?: string` prop renders a monospace pill badge beneath the card title
- **`docs/decisions/ADR-2025-007.md`** — ratification record for COUNCIL-2025-007 course catalog classification
- **`docs/github-setup.md`** — branch protection settings, required secrets, status check configuration
- **`docs/testing.md`** — complete unit/coverage/e2e guide; test user table; CI environment setup instructions
- **`supabase/seed.test.sql`** — deterministic test seed with fixed UUIDs (auth pattern `0001-XXXXXX`, profile pattern `0002-XXXXXX`); uses `display_name` and `uid` PK
- **`scripts/ci-setup-test-env.mjs`** — CI helper that sets test-user passwords via `supabase.auth.admin.updateUserById()`
- **`vitest.config.ts`** — added coverage include/exclude/thresholds; `passWithNoTests: true`

### Changed

- **`src/app/layout.tsx`** — replaced `<Navbar>` with `<SidebarProvider> → <Sidebar> + <SidebarMain>`; `pb-16 md:pb-0` mobile padding moved into `SidebarMain`; `id="main-content"` skip-nav target now on the `SidebarMain` wrapper
- **`NotificationBell`** — added `sidebar?: boolean` and `collapsed?: boolean` props; in sidebar mode trigger becomes a full-width nav-item-style button; notification panel opens upward (`bottom-full mb-2`) instead of downward to avoid sidebar clipping; `aria-expanded` fixed to use spread pattern (HTML validator false-positive workaround); `type="button"` added to trigger
- **`GlobalSearch`** — added `variant: 'navbar' | 'sidebar'` and `collapsed?: boolean` props; sidebar variant renders a nav-item-style trigger with animated label; `type="button"` added to all three buttons in the component
- **`MessageThread`** — inline `useEffect` realtime subscription replaced with `useRealtimeChannel`; dedup logic preserved for optimistic messages
- **`Navbar`** — server notification fetches (unread count + recent notifications) removed; these are now handled client-side by `useNotifications` in `NotificationBell`
- **`tsconfig.json`** — added `"types": ["vitest/globals"]` to eliminate `describe`/`it`/`expect` type errors in test files
- **`package.json`** — added `test`, `test:run`, `test:ci`, `typecheck` scripts; version bumped to `0.18.0`

### Fixed

- **`src/app/api/health/route.ts`** — removed erroneous `'use server'` directive (route handlers are server-side without it; the directive caused a build error when `export const runtime = 'nodejs'` was present)
- **`src/app/actions/cohorts.ts`** — double type cast `as unknown as CohortMember[]` resolves TypeScript incompatibility between Supabase's `auth_user` array return and the expected object shape

---

## [0.17.0] — 2026-06-15

### Added

- **`/api/ai/related-concepts` route** — staff-only POST endpoint; takes `{ pageId }`; fetches up to 3 active embedding chunks for the page; calls `find_related_concepts()` (SECURITY DEFINER, role-gated) for each; deduplicates by source page; returns top 5 by similarity with `sectionCode` and `blueprintTitle`
- **`RelatedConceptsPanel` component** — client component rendered below the page editor for published pages; "Find Related" / "Refresh" button triggers semantic search; results show section code badge, blueprint title, similarity score (colour-coded ≥90% emerald / ≥80% violet / <80% amber), and a three-line chunk excerpt; shows contextual message for pending/processing/failed indexing states
- **Content editor related content panel** — `embedding_status` added to page query in `/courses/[id]/pages/[pageId]/edit`; `RelatedConceptsPanel` rendered in a matching `max-w-3xl` container below `PageEditor` for published pages only

---

## [0.16.0] — 2026-06-15

### Added

- **Migration 039** — Phase 4 advanced AI: HNSW index replaces IVFFlat on `embeddings` (`m=16, ef_construction=64`); `search_content_chunks_multi(vector, uuid[], int, float)` — SECURITY INVOKER, cross-enrollment vector search returning `section_code`; `list_user_active_sections(uuid)` — SECURITY INVOKER, enumerates all active enrolled sections for multi-section tutor scope; `find_related_concepts(uuid, int)` — SECURITY DEFINER, staff-only cross-section concept linker; `chk_attempt_count_non_negative` and `chk_chunk_char_count_positive` DB constraints added
- **Multi-section AI tutor** — tutor route calls `list_user_active_sections()` to discover all active enrollments, uses `search_content_chunks_multi()` when student is in multiple sections; citations now include `sectionCode` when a chunk originates from a non-primary section
- **`TutorChat` cross-section attribution** — citation pills show section code in monospace when chunk comes from a different section than the one being viewed
- **`/api/ai/confusion-topics` route** — staff-only POST endpoint; queries `ai_query_log` for low-similarity and zero-match signal; samples up to 15 indexed content chunks; synthesizes a curriculum gap analysis via GPT-4o; no student query text stored or transmitted
- **`ConfusionReport` component** — client component with "Generate Analysis" / "Regenerate" button; shows query stats (total / low-match / zero-match / avg similarity) alongside GPT-4o gap analysis; pulsing indicator while generating
- **AI Analytics gap analysis section** — top 5 sections by query volume each get a `ConfusionReport` panel on the analytics page
- **`phase4_advanced_ai_test.sql`** — 22 pgTAP assertions: function existence, SECURITY INVOKER/DEFINER verification, HNSW index presence, IVFFlat removal, CHECK constraints, privilege grants, execute denial for anon

### Changed

- `src/types/ai.ts` — `ContentChunk` gains optional `sectionCode?: string` field (present only for cross-section chunks)
- `src/app/admin/ai-analytics/page.tsx` — adds `sectionCodeMap` alongside existing `sectionNameMap`

---

## [0.15.0] — 2026-06-15

### Added

- **Track-aware system prompt** — `buildSystemPrompt(ctx)` replaces static `SYSTEM_PROMPT` in `/api/ai/tutor`; program track name calibrates vocabulary and framing without being echoed; delivery format calibrates answer depth (self_paced → thorough, synchronous → concise); cohort name used for context only, never revealed
- **AI tutor context isolation pgTAP suite** — `ai_tutor_context_test.sql` (20 assertions): `build_tutor_context()` raises on missing/suspended/withdrawn enrollment; `search_content_chunks()` raises for unenrolled section; cross-section RLS isolation verified; `SECURITY INVOKER` confirmed on both functions via `pg_proc.prosecdef`; vector(1536) dimension pin verified; `query_text` column absence asserted
- **`/admin/ai-analytics` page** — last-30-day query analytics: total queries / unique sections / unique learners / avg chunks per query; queries-per-day bar chart; top sections by query volume; query volume by cohort (joined via `cohort_members`); context version distribution; low-similarity sections flagged as content gap signals (avg best-match < 80%, ≥3 queries)
- **"AI Analytics" nav link** — admin-only, in NavLinks alongside Blueprints

---

## [0.14.0] — 2026-06-15

### Added

- **`/api/ai/tutor` route** — streaming POST endpoint; authenticates user; calls `build_tutor_context()` (SECURITY INVOKER) for academic/cohort/track context; generates ephemeral query embedding via OpenAI `text-embedding-3-small`; calls `search_content_chunks()` (SECURITY INVOKER + RLS); assembles prompt with system instructions and delimited content blocks; streams GPT-4o response as SSE; logs SHA-256 query hash to `ai_query_log`; `userId` and query embeddings never appear in any response body
- **`TutorChat` component** — streaming chat UI; SSE reader decodes `context` (source citations), `delta` (text chunks), `done`, and `error` events; citation links route to content page editor; pulsing dots while streaming; "Content is being indexed" disabled state; ⌘↵ or Ask button submits
- **`/courses/[id]/tutor` page** — section-aware tutor page; takes `?section=sectionId` param; verifies active enrollment for non-staff; checks for published indexed pages; shows "No published content yet" empty state; renders `TutorChat` once content exists
- **Section detail "Preview AI Tutor" link** — staff can open the AI tutor for any section directly from `/admin/sections/[id]`

### Changed

- `/admin/sections/[id]` — `course_blueprints` join now also fetches `id` (needed for AI Tutor link)

---

## [0.13.0] — 2026-06-15

### Added

- **ADR-2025-003 ratified** — Unified AI embedding architecture; 6/6 council unanimous; 18 amendments adopted
- **Migration 038** — Phase 0 unified embeddings: `embeddings` table (pgvector 1536-dim, IVFFlat), `embedding_jobs` table (dual-path pipeline with `attempt_count`), `ai_query_log` table (SHA-256 query hash, no PII); `embedding_status` columns on `content_pages`; drops any pre-existing `embedding` vector column from `content_pages`
- **`search_content_chunks()`** — SECURITY INVOKER search function; scoped to `section_id`; explicit `check_section_access()` gate as second line of defense; query embeddings use-and-discard, never persisted
- **`build_tutor_context()`** — SECURITY INVOKER context builder; assembles cohort, program track, enrollment, and access window into typed JSONB; raises on non-active enrollment
- **Staleness trigger** — `trg_content_pages_mark_stale` deactivates existing embeddings and sets `embedding_status = 'stale'` when published page body is updated
- **Immediate withdrawal refresh trigger** — `trg_enrollment_status_refresh` fires `REFRESH MATERIALIZED VIEW CONCURRENTLY effective_enrollments` on withdrawal/suspension; access revoked within seconds
- **pg_cron jobs** — `embeddings-orphan-cleanup` (nightly 03:00 UTC); `embedding-jobs-recovery` (every 10 min; requeues stuck/failed jobs with `attempt_count < 3`)
- **Initial embed queue** — migration seeds `embedding_jobs` for all currently published pages
- **Edge Function `generate-embedding`** — Deno; triggered by DB webhook or pg_cron recovery; Tiptap JSON → plain text → semantic chunks (≤1200 chars, 150-char overlap) → OpenAI `text-embedding-3-small` → `embeddings` table; batched at 20 chunks/call; dual-path (webhook fast + recovery)
- **`src/types/ai.ts`** — `TutorQueryContextInternal`, `TutorPromptContext`, `ContentChunk`, `EmbeddingStatus`; `queryEmbedding` deliberately absent from context type (use-and-discard in flight)
- **`embedding_status` badge** — "AI Ready" (violet) / "Indexing" (slate) / "Index failed" (rose) shown on published pages in the course pages list; draft pages show no badge
- **pgTAP suite `unify_embeddings_test.sql`** — 48 assertions covering table structure, RLS policy names, INSERT denial for authenticated roles, RLS isolation, function existence, trigger existence, staleness/withdrawal triggers, and constraint violations

---

## [0.12.0] — 2026-06-15

### Added

- **Phase 1A admin CRUD** — Terms (`/admin/terms`, `/admin/terms/new`, `/admin/terms/[id]`), Blueprints (`/admin/blueprints`, `/admin/blueprints/new`, `/admin/blueprints/[id]`), Section creation wizard (`/admin/sections/new`) with inline access-window fields; shared `TermForm` and `BlueprintForm` client components handle both create and edit modes; `src/app/actions/academic.ts` server actions for all six operations
- **Image upload** — `POST /api/upload/image` endpoint (5 MB limit, JPEG/PNG/WebP/GIF, staff-only); `RichTextEditor` toolbar button triggers file-picker; drag-and-drop and paste-from-clipboard also upload automatically; images stored in Supabase Storage bucket `content-images`
- **`DiscussionEditor`** — minimal Tiptap editor (bold, italic, underline, bullet list, ordered list only; no headings or images); ⌘↵ or Send button submits; replaces plain `<input>` in `GroupDiscussionBoard`
- **Unsaved-changes guard** — `useBeforeUnload(isDirty)` hook warns before tab/window close when `PageEditor` has a pending or failed save
- **NavLinks** — "Terms" and "Blueprints" added as admin-only links; "New Section" button on `/admin/sections`

### Fixed

- `aria-pressed` in `RichTextEditor` toolbar now passes `'true'` / `'false'` strings instead of booleans (ARIA conformance)
- Three `<button>` elements in `GroupDiscussionBoard` missing explicit `type` attribute

---

## [0.11.0] — 2026-06-15

### Added

- **ADR-2025-002** — Full council ratification (COUNCIL-2025-002, 6/6 unanimous); merged to `docs/decisions/`
- **Migration 035** — Phase 1A academic skeleton: `program_tracks`, `academic_terms` (nested, depth ≤ 4, JSONB config inheritance), `course_blueprints`, `course_sections` (with `resolved_config` snapshot trigger), `access_windows` (content-gating security boundary), `meeting_schedules` (sync/hybrid only, enforced by trigger, UTC normalization)
- **Migration 036** — Phase 1B enrollment engine: `global_cohorts`, `cohort_members`, `enrollment_jobs`, `cohort_section_enrollments`, `direct_enrollments`, `enrollment_audit_log`; enrollment state machine DB trigger; source-lock trigger; `effective_enrollments` materialized view; `bulk_enroll_cohort()` SECURITY DEFINER function with dry-run mode and batch cursor resumption
- **Migration 037** — Phase 2 section groups: `section_groups`, `section_group_members`, `group_threads`, `group_posts`; `is_group_member()` SECURITY DEFINER helper; `get_my_groups()` RPC; `get_group_thread_posts()` RPC with group isolation enforcement
- **pgTAP suites** — 52 assertions for Phase 1A, 46 assertions for Phase 1B, 42 assertions for Phase 2; all include exact RLS policy name checks via `policies_are()`
- **Admin cohorts UI** — `/admin/cohorts` list, `/admin/cohorts/new`, `/admin/cohorts/[id]` detail with member panel and job history, `/admin/cohorts/[id]/enroll` two-step dry-run → confirm enrollment wizard
- **Admin sections UI** — `/admin/sections` list with group counts, `/admin/sections/[id]` group management panel with inline add/remove members and collapsible group cards
- **Student group portal** — `/my-groups` dashboard (calls `get_my_groups()` RPC), `/my-groups/[groupId]` discussion board with thread list sidebar, message-bubble post feed, Supabase Realtime subscription, soft-delete
- **Server actions** — `src/app/actions/cohorts.ts` (create, update, add/remove member, bulk enroll) and `src/app/actions/groups.ts` (create group, delete group, add/remove member, create thread, post, soft-delete post)
- **NavLinks** — "My Groups", "Cohorts", "Sections" links (appropriate role gating)

---

## [0.10.0] — 2026-06-14

### Added

- **ADR-2025-001** — Architecture Decision Record for Tiptap over TinyMCE merged to `docs/decisions/`
- **Tiptap rich text editor** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-underline`, `@tiptap/extension-placeholder`, `@tiptap/html`) — headless ProseMirror-based editor; MIT licensed; no CDN or API key required
- **`RichTextEditor` component** — full toolbar (undo/redo, H1–H3, bold/italic/underline/strikethrough/code, bullet list, ordered list, blockquote, code block, horizontal rule); autosave-compatible `onChange` handler; placeholder text; configurable `minHeight`; mobile-viewport warning shown at < 640px
- **`SaveIndicator` component** — shows "Saving…" spinner, "✓ Saved N min ago" (refreshes every 10 s), or "✕ Save failed" based on `SaveState`
- **`useContentAutoSave` hook** — 800 ms debounce; flushes pending save on unmount; `saving` / `saved` / `error` state management; concurrent-save guard via `savingRef`
- **`content_pages` table** — JSONB `body` column (Tiptap doc format); `body_text TEXT GENERATED ALWAYS AS` via `tiptap_json_to_text()` immutable function (enables FTS); `format_version` column (`"tiptap-v2"` default); `status` enum (`draft | published | archived`); GIN full-text index; 3 RLS policies (admin/manager full, teacher owns, learner reads published)
- **`content_pages_public` view** — `security_invoker = true`; excludes future `embedding` column from learner-facing queries
- **`tiptap_json_to_text(JSONB)` function** — immutable SQL function; `$.** ? (@.type == "text")` jsonpath traversal; used as generated column expression
- **`/courses/[id]/pages`** — staff page list with status badges and "New Page" button (server action creates row and redirects)
- **`/courses/[id]/pages/[pageId]/edit`** — full-screen page editor; inline title editing (saves on blur); autosave body; Publish / Unpublish / Archive actions; breadcrumb nav
- **`/api/digest` route** — see v0.9.0 (Phase 8 entry)
- **pgTAP tests** — `supabase/tests/content_pages_rls_test.sql`; 12 assertions covering table structure, view structure, `tiptap_json_to_text` correctness, status constraint, and RLS policy names
- **Pages link** added to course detail staff action strip
- Migration 034: `tiptap_json_to_text`, `content_pages`, RLS policies, `content_pages_public` view

### Changed

- **`PageForm`** (CourseBuilder) — textarea replaced with `RichTextEditor`; saves Tiptap JSON (`content.body`) instead of plain string; handles legacy string bodies on load
- **`BlockPlayer`** — page branch now calls `tiptapToHtml(content.body)` from `src/utils/tiptap.ts`, which transparently handles both legacy string content and new Tiptap JSON; `@tiptap/html`'s `generateHTML` runs server-side (no DOM required)
- **Navbar** — brand text updated from "ChurchCore" to "ChurchCore LMS"

---

## [0.9.0] — 2026-06-14

### Added

- **Scheduled announcements** — "Schedule for later" toggle on the new-announcement form lets staff pick a future date/time; announcement is stored as `is_published = true` with a future `publish_at` so the existing RLS gate auto-publishes it at the right moment with no cron needed; staff see a "Scheduled" section on the announcements list showing upcoming queued items with their publish time
- **Live session blocks** — `live_session` block type activated (was `is_active = false`); new `LiveSessionPlayer` client component shows session title, platform, scheduled date/time, live countdown timer (refreshes every second), "Join Now" button enabled 15 minutes before start, recording URL link once session ends; new `LiveSessionForm` in the CourseBuilder with provider dropdown (Zoom/Meet/Teams/YouTube/Other), meeting URL, scheduled date/time, duration, and optional recording URL
- **Parent/guardian access** — `guardian` value added to `user_role` ENUM; `guardian_links(guardian_uid, student_uid)` table with RLS; `get_guardian_students()` SECURITY DEFINER returns a guardian's linked students; `get_guardian_student_overview(uid)` SECURITY DEFINER returns a full read-only snapshot (profile, enrollments + progress bars, last 10 grades, certificates); staff-only `link_guardian_to_student(student_uid, guardian_email)` and `unlink_guardian_from_student()` RPCs; `/guardian` portal page with student cards; `/guardian/[studentId]` detail page; "Guardian Portal" nav link visible only when `role = 'guardian'`
- **Email digest** — `GET /api/digest` endpoint sends a weekly HTML summary email per active student via Resend; covers unread notifications, newly graded assignments, and new announcements from the past 7 days; students with nothing to report are skipped; protected by `Authorization: Bearer <CRON_SECRET>` header; `email_digest_enabled` (default `true`) and `last_digest_sent_at` columns added to `profiles`; trigger weekly via Vercel Cron (`0 8 * * 1`), GitHub Actions, or any HTTP scheduler
- Migration 033: `guardian` role, `guardian_links` table, profile digest columns, live session activation, guardian SECURITY DEFINER functions

### Changed

- `.env.example` documents `CRON_SECRET`
- `NavLinks` accepts `isGuardian` prop; `Navbar` computes and passes it

---

## [0.8.0] — 2026-06-14

### Added

- **Course prerequisites enforcement** — `enrollSelf` validates `min_required_level` vs student level and `prerequisite_course_id` completion server-side before inserting enrollment row; course detail page shows "Level X+ required" badge and prerequisite course name; `EnrollButton` renders a locked state with reason text when student doesn't qualify
- **Discussion reply editing** — own replies show Edit/Delete actions; `edit_discussion_reply(submission_id, text)` SECURITY DEFINER RPC with ownership + length validation; edited replies show "(edited)" label
- **Discussion reply deletion** — `delete_discussion_reply(submission_id)` SECURITY DEFINER RPC with ownership check; soft-deletes the submission row (consistent with `is_deleted` pattern)
- **Assignment file uploads** — `assignment-files` private Supabase Storage bucket (10 MB limit, PDF/Word/image types); file picker in AssignmentPlayer with name/size display, 30-day signed URL stored in submission `content` JSONB; file previewed in submitted and graded states; staff can read all files (RLS policy)
- **Email notifications on grade posting** — when `RESEND_API_KEY` is set, `gradeSubmission` sends a transactional grade email via Resend to the student's address; failure is silently caught so grading is never blocked by email errors
- Migration 032: `edit_discussion_reply`, `delete_discussion_reply`, `assignment-files` storage bucket + RLS

### Changed

- `EnrollButton` now accepts `locked` and `lockReason` props
- `.env.example` documents `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL`

---

## [0.7.2] — 2026-06-14

### Security

- **Next.js upgraded to 16.2.9** — resolves 3 high-severity CVEs (DoS via Image Optimizer, HTTP request smuggling in rewrites, middleware/proxy cache poisoning) and 2 moderate CVEs resolved
- **DB: `function_search_path_mutable`** — added `SET search_path = public` to 6 functions that lacked it: `handle_xp_level_escalation`, `handle_new_user`, `handle_updated_at`, `generate_student_id`, `assign_student_id`, `calculate_level`
- **DB: `materialized_view_in_api`** — revoked direct `SELECT` on `mv_academic_performance` from `anon` and `authenticated`; data is accessible only through SECURITY DEFINER accessor functions
- **DB: `anon_security_definer_function_executable`** — revoked `EXECUTE` from `anon` on all 24 SECURITY DEFINER functions; unauthenticated callers had no legitimate use for any RPC
- **DB: `authenticated_security_definer_function_executable`** (partial) — revoked `EXECUTE` from `authenticated` on all trigger-only functions (`handle_new_user`, `handle_xp_level_escalation`, `handle_updated_at`, `assign_student_id`, `sync_profile_roles`, `update_thread_on_message`, `generate_student_id`, `refresh_academic_performance`) that should only be invoked by database triggers, never via `/rest/v1/rpc/`
- Migration 031

### Fixed

- `searchParams` and `params` in page components updated to async `Promise<>` type (Next.js 15+ breaking change)
- `cookies()` in auth callback and `createClient` server util made async
- `ReturnType<typeof createClient>` changed to `Awaited<ReturnType<typeof createClient>>` in server action helpers

---

## [0.7.1] — 2026-06-14

### Security

- **`v_unified_calendar`** — recreated with `security_invoker = true`. The prior default (`SECURITY DEFINER`) caused the view to run with the view owner's permissions, silently bypassing RLS on `calendar_events` for querying users.
- **`block_types`** — enabled RLS and added a read-only `FOR SELECT` policy for `authenticated`. Previously any authenticated user could INSERT, UPDATE, or DELETE block type registry entries. Write operations are now blocked by default at the RLS layer; only the service role can mutate the table.
- Migration 030

---

## [0.7.0] — 2026-06-14

### Added

- **Discussion threads** — per-block discussion boards using `get_block_discussion_replies()` SECURITY DEFINER function; any enrolled student can read all replies; one reply per student per block
- **Bulk enrollment** — `/courses/[id]/enroll` staff page with search, per-student enroll/unenroll, progress display; backed by `staff_enroll_student()` and `staff_unenroll_student()` SECURITY DEFINER RPCs; enrollment triggers a `course_enrollment` notification
- **QuizPlayer XP** — quizzes now correctly pass `base_xp_reward` from block gamification config to `submitQuiz`; grade-scaled XP with a 50% floor
- Migration 029: `get_block_discussion_replies`, `staff_enroll_student`, `staff_unenroll_student`

---

## [0.6.0] — 2026-06-14

### Added

- **XP award system** — `award_xp(uid, amount)` SECURITY DEFINER function atomically increments XP and recomputes level; `calculate_level(xp)` immutable SQL function
- **10-level progression** — thresholds at 100 / 250 / 500 / 1K / 2K / 4K / 8K / 15K / 30K XP
- **Course completion flow** — "Complete course" button in LearningShell triggers XP award + certificate issue + redirect to `/courses/[id]/complete`
- **Course completion page** — celebration page with certificate card (student name, course, grade, XP, certificate number, date), level badge, confetti gradient
- **`course_certificates` table** — idempotent `issue_certificate(uid, course_id)` SECURITY DEFINER; fires `certificate_earned` notification; unique certificate number (`CERT-XXXXXXXX`)
- **`/certificates` page** — grid of all earned certificates with FK join to course title
- **XP toast** — floating `+N XP ✨` toast in LearningShell on block completion
- XP awarded on: block view (`base_xp_reward`), quiz submit (grade-scaled), assignment submit (10 XP), instructor grade (proportional, max 50 XP), course completion (100 XP bonus)
- Migration 028: `calculate_level`, `award_xp`, `course_certificates`, `issue_certificate`

---

## [0.5.0] — 2026-06-14

### Added

- **Leaderboard** — `/leaderboard` top 50 students by XP with podium, progress bars, personal rank card
- **Global search** — ⌘K modal searching courses, announcements, and people (staff only); 200ms debounce, keyboard nav (↑↓ Enter Esc), match highlighting; `/api/search` route
- **Notifications page** — `/notifications` full list with unread/all filter, type icons, dismiss (×), mark-all-read
- **`/certificates` route stub** for future use
- Notification bell "See all →" footer link
- **`await createClient()`** fixed across 16 server files that were calling the async helper synchronously (messages, calendar, announcements, courses, actions, dashboard widgets, profile, Navbar)
- `Leaderboard` added to NavLinks

### Fixed

- `courses/page.tsx` — missing `await createClient()` caused runtime errors; also fixed admin/manager to see all courses (not just `owner_id` matches)
- `admin/users/page.tsx` — missing `await`
- `profile/page.tsx` — missing `await`

---

## [0.4.0] — 2026-06-13

### Added

- **Phase 6: Interactive Learning Experience**
  - `LearningShell` — collapsible sidebar, module tree, prev/next navigation, progress tracking
  - `BlockPlayer` — routes by `block_type_id`: page (HTML), video (YouTube/Vimeo/native), file (download), URL (link), assignment, quiz, discussion (stub)
  - `QuizPlayer` — MCQ radiogroup, auto-grading against `correct_index`, correct/wrong highlight on result
  - `AssignmentPlayer` — text submission with submitted/graded state and feedback display
  - `VideoPlayer` — YouTube and Vimeo embed + native `<video>` fallback
  - `EnrollButton` — client component calling `enrollSelf` server action
  - `/courses/[id]/learn` — server component; redirects unenrolled non-staff
  - `/courses/[id]/submissions` — grading queue with status and block filters
  - `SubmissionCard` + `GradeForm` — inline grading with live % preview
  - `/courses/[id]/analytics` — class stats, student table, at-risk highlights, CSV export
  - `/performance` — student GPA + per-course grade table with XP totals
  - `src/app/actions/learning.ts` — `enrollSelf`, `markBlockViewed`, `submitAssignment`, `submitQuiz`, `gradeSubmission`
  - Migration 027: `block_submissions` schema, `grade_pct` generated column, `mv_academic_performance` rebuild, SECURITY DEFINER access functions

- **Phase 5: Smart Intelligence + Polish**
  - Time-of-day dashboard reordering (morning/afternoon/evening/night)
  - `InstructorActionPanel` — ungraded submissions + at-risk students + unread messages
  - `DashboardPerformancePanel` — student GPA widget
  - `AiWeeklySummary` — lazy Claude-powered weekly summary button
  - `MobileBottomNav` + `MobileBottomNavServer` — 5-tab fixed mobile nav, iOS safe area
  - WCAG 2.1 AA — skip link, `aria-expanded`, `role="dialog"`, `aria-live`, `:focus-visible` CSS
  - `/api/ai/weekly-summary` route (server-side Claude call)

---

## [0.3.0] — 2026-06-12

### Added

- **Phase 4: Academic Performance**
  - `mv_academic_performance` materialized view
  - `get_my_academic_performance()`, `get_course_performance()`, `get_my_overall_gpa()` SECURITY DEFINER functions
  - Migration 026
- **Messaging** — threads, participants, real-time unread count via `count_unread_message_threads()` RPC
  - Migration 024
- **Announcements + Calendar**
  - Migration 025
- **Dashboard Phase 1** — `notifications` table, enrollment progress columns, profile columns
  - Migration 023

---

## [0.2.0] — 2026-06-11

### Added

- **Phase 3: Course builder** — drag-and-drop block builder, block type registry, module headers, XP config per block
- **Phase 2: HQ** — strategic workspace for admin (decisions, tasks, risks, council reviews)
  - Migrations 001–022
- Role-based dashboards (student / instructor / admin)
- Supabase Auth integration with magic link

---

## [0.1.0] — 2026-06-10

### Added

- Initial project scaffold: Next.js 14 App Router, Tailwind CSS, shadcn/ui, Supabase
- Two-layer identity pattern: `profiles.uid` (domain PK) + `profiles.auth_id` (FK to `auth.users`)
- `profile_roles` lookup table + SECURITY DEFINER helpers to prevent RLS recursion
- `user_role` ENUM: `admin | manager | teacher | student`
- Base migrations 001–009

---

[Unreleased]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.22.0...HEAD
[0.22.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.20.2...v0.21.0
[0.20.2]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.20.1...v0.20.2
[0.20.1]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.20.0...v0.20.1
[0.20.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.7.2...v0.8.0
[0.7.2]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ricardojjulia/ChurchCore-LMS/releases/tag/v0.1.0
