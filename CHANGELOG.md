# Changelog

All notable changes to ChurchCore LMS are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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

[Unreleased]: https://github.com/ricardojjulia/ChurchCore-LMS/compare/v0.9.0...HEAD
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
