# Changelog

All notable changes to ChurchCore LMS are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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
