# Changelog

All notable changes to ChurchCore LMS are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- File upload for assignment submissions (Supabase Storage)
- Email notifications on grade posting (Edge Function + Resend)
- Course prerequisites enforcement (min_required_level gate)
- Discussion reply editing and deletion

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

[Unreleased]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ricardojjulia/ChurchCore-LMS/releases/tag/v0.1.0
