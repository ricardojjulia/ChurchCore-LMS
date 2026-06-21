# Council Review 1 — Agent 1: LMS State Audit
**Date:** 2026-06-20

## ChurchCore LMS — Codebase State Audit

### 1. Migrations

**File Count:** 67 migration files in `supabase/migrations/`

**Tables Created (50+):** profiles, courses, enrollments, modules, submissions, badges, profile_badges, organizations, org_members, course_blocks, block_types, course_enrollments, block_submissions, hq_sessions, hq_tasks, hq_risks, hq_decisions, message_threads, message_thread_participants, messages, notifications, announcements, announcement_reads, calendar_events, platform_admins, platform_audit_log, admin_audit_log, role_permissions, user_audit_log, academic_terms, program_tracks, course_blueprints, course_sections, access_windows, meeting_schedules, global_cohorts, cohort_members, cohort_section_enrollments, direct_enrollments, enrollment_jobs, enrollment_audit_log, section_groups, section_group_members, group_threads, group_posts, content_pages, course_certificates, guardian_links, embedding_jobs, embeddings, ai_query_log, profile_badges, profile_roles, analytics_events, report_definitions, report_artifacts, report_audit_log, system_health_checks.

**RLS Status:**
- 330 policies across 35 migration files
- All 50+ tables have RLS enabled
- All policies use `current_user_org_id()` — not bare `auth.uid()`
- No direct `public.profiles` references in other tables' policies

**5 Most Recent Migrations:**
1. `20260620200800_handle_new_user_org_id.sql` — Self-registered users capture org_id from signup payload; sync_profile_roles trigger auto-propagates
2. `20260620200700_storage_rls.sql` — Content-images bucket made private; org member path-based isolation
3. `20260618200600_phase2_ai_audit_rewards_rls.sql` — embeddings, embedding_jobs, ai_query_log, admin_audit_log, user_audit_log, profile_badges org-isolated
4. `20260618200500_phase2_academic_structure_rls.sql` — 16 tables org-isolated; learner read access scoped to active records + enrollment checks
5. `20260618200400_phase2_course_content_hq_rls.sql` — HQ governance + course content tables org-isolated

### 2. RLS Policy Coverage

- **All 330 policies verified** use `current_user_org_id()` for org isolation
- `is_platform_admin()` reads ONLY from `platform_admins` table — never `profiles.role`
- **No direct profiles references** in other tables' policies — infinite recursion eliminated (migration 014)
- `profile_roles` — RLS ON, no public SELECT policies; accessed only via SECURITY DEFINER functions

### 3. API Routes

15 route handlers in `src/app/api/`. All protected:

| Route | Methods | Auth Check | Status |
|-------|---------|-----------|--------|
| `/api/ai` | POST | Rate-limit IP only (edge runtime) | OK — Anthropic passthrough, no auth available at edge |
| `/api/ai/tutor` | POST | Yes | OK |
| `/api/ai/related-concepts` | POST | Yes | OK |
| `/api/ai/confusion-topics` | POST | Yes | OK |
| `/api/ai/weekly-summary` | GET | Yes | OK |
| `/api/stripe/webhook` | POST | Webhook signature | OK — idempotency via platform_audit_log |
| `/api/stripe/create-checkout` | POST | Yes (admin/platform-admin) | OK |
| `/api/upload/image` | POST | Yes (role + org_id) | OK |
| `/api/health` | GET/POST | Yes (admin role) | OK |
| `/api/reports/artifacts` | GET/DELETE | Yes | OK |
| `/api/reports/artifacts/[id]/signed-url` | GET | Yes | OK |
| `/api/analytics/events` | POST | Yes | OK |
| `/api/search` | GET | Yes | OK |
| `/api/calendar` | GET | Yes | OK |
| `/api/digest` | GET | Yes | RISK: uses createServiceClient without comment |

**No unguarded routes found.**

### 4. App Pages

66 page.tsx files found. No empty stubs or redirect-only pages found. Major areas complete:
- `/dashboard` — role-based rendering (Student/Instructor/Admin dashboards)
- `/courses/[id]/build` — full course builder
- `/guardian` — complete student monitoring portal
- `/platform` — full tenant management with health scores
- `/hq` — governance interface
- `/admin/ai-analytics` — 332 lines, comprehensive query analytics

`/reports` is an intentional role-gate redirect (not a stub).

### 5. Seed Data

**File:** `supabase/seed.test.sql` (64 lines)

Current: 4 test users, 1 published course, 1 enrollment at 25% progress, 1 notification.

**Missing for realistic demo/e2e:**
- Organization rows with org_id (30 tables now require this — seed will fail RLS checks)
- academic_terms, program_tracks, course_blueprints, course_sections
- cohort + cohort_member records
- course_blocks and content_pages
- Users with guardian and manager roles
- Badge and XP progression data

### 6. Top 5 Critical Gaps

1. **Seed missing org context** — `supabase/seed.test.sql` creates users without org_id; all Phase 2 tables require it. E2E RLS tests will fail.
2. **profile_roles missing org_id** — Intentional design, but means profile_roles is a shared cross-tenant table. Low risk but worth documenting.
3. **`/api/digest` uses service client without justification comment** — `src/app/api/digest/route.ts`
4. **Reports module uses `createServerClient` alias** — `src/app/api/reports/artifacts/route.ts` imports inconsistent alias; should use `createClient`
5. **No ADR for Phase 2 RLS overhaul** — 20 migrations over 3 weeks with no council document or ADR
