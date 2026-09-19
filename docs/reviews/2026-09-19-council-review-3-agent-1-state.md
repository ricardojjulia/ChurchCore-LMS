# Council Review 3 — Agent 1: LMS State Audit

**Date:** 2026-09-19 · **Branch:** codex/oneroster-verification-refresh · **Version:** 0.28.1

---

## 1. Migrations

**Summary**: 109 migration files total; 74 CREATE TABLE statements across 30 files with RLS enabled; 45 files contain 376 CREATE POLICY statements.

**5 Most Recent Migrations**:
1. `supabase/migrations/20260914151000_restore_api_role_table_privileges.sql` — Restored GRANT SELECT/INSERT/UPDATE/DELETE to authenticated role for all tables (PostgREST privilege audit fix)
2. `supabase/migrations/20260914150000_fix_academic_enrollment_bridge_identity.sql` — Fixed direct_enrollments (auth.users) → enrollments (profiles.uid) identity boundary via trigger
3. `supabase/migrations/20260914121000_fix_oneroster_preview_lint_warning.sql` — Optimized OneRoster preview function to eliminate dead PL/pgSQL variables
4. `supabase/migrations/20260908130000_oneroster_identity_linking.sql` — Implemented OneRoster identity linking (existing-account-only, never creates auth.users from roster)
5. `supabase/migrations/20260908120000_oneroster_bulk_omission_reconciliation.sql` — OneRoster bulk import for academicSessions, courses, classes (identity/enrollment linking deferred to later phase)

**RLS Coverage Assessment**:

- **Full RLS Coverage (70+ tables)**: organizations, profiles, courses, course_blocks, enrollments, course_enrollments, announcements, calendar_events, badges, notifications, messages, hq_sessions, hq_tasks, hq_decisions, program_tracks, course_blueprints, academic_terms, course_sections, question_banks, engagement_events, platform_feedback, platform_admins, platform_audit_log, oneroster_connections, oneroster_import_jobs, oneroster_import_rows, external_entity_links, etc.
- **Helper Functions Correct**: `current_user_org_id()`, `current_user_uid()`, `current_user_role()`, `is_platform_admin()` all use `profile_roles` table (not `profiles`), preventing infinite recursion. Per `supabase/migrations/20240601000014_fix_rls_recursion.sql`, profile_roles has RLS enabled with zero client-visible policies — only SECURITY DEFINER helpers can access it.
- **Policy Drops & Fixes**: Old dangerous policies that directly referenced `public.profiles` in USING clauses were systematically dropped and replaced across several migrations.
- **Tenant Isolation**: All customer-facing tables have `org_id` NOT NULL columns and policies enforce `is_platform_admin() OR current_user_org_id() = org_id`. Platform-plane tables have no org_id (correct isolation).

**No Critical RLS Bugs Found**: All 376 active policies use proper helper functions; no exposed infinite recursion paths.

---

## 2. API Routes

**Total**: 28 route files under `src/app/api/`. All properly call `supabase.auth.getUser()` or equivalent. Service role usage is server-side only (30 files, never in client exports). No raw database errors returned.

---

## 3. App Pages

**Total**: 70 page.tsx files. No STUB pages found — all contain meaningful content, data fetching, and rendering.

---

## 4. Seed Data

**Location**: `supabase/seed.test.sql` (900+ lines). 2 organizations, 6 users (all roles), 5 courses, enrollments/progress, guardian links, profile_roles correctly synced.

**Missing for closed-beta**: no Stripe subscription records, no badge achievements/XP history, no message threads/group posts, no OneRoster connection test data, no engagement events/streak records.

---

## 5. Top 5 Critical Gaps (as originally reported)

1. **Stripe Customer ID Backfill Incomplete** — `organizations.stripe_customer_id` nullable, no sync before checkout completes.
2. ~~**profile_roles Lacks tenant_active Refresh on Org Status Change**~~ — **INVALIDATED on synthesis verification.** `sync_org_status_to_profiles()` is actually called from `src/app/platform/actions.ts` lines 100, 112, 126 (suspend/restore/reactivate). See synthesis doc.
3. **OneRoster Import Has No Rollback on Partial Failure** — `apply_oneroster_job()` in `supabase/migrations/20260907110000_oneroster_transactional_apply.sql`.
4. ~~**Platform Admin Bootstrap Hardcoded**~~ — **INVALIDATED on synthesis verification.** This is CLAUDE.md rule 6's deliberate design ("First platform admin is bootstrapped via a migration... never via application UI"), not a gap. See synthesis doc.
5. **Guardian Notification Queue Has No Retry or Deadletter** — `supabase/migrations/20260620100000_guardian_notification_queue.sql`.

**Security Posture**: Strong. **Feature Completeness**: MVP-ready, no stubs. **Data Consistency**: gaps in Stripe sync and OneRoster rollback (both confirmed). **Operational Readiness**: guardian notification durability is the one confirmed real gap of the original five.
