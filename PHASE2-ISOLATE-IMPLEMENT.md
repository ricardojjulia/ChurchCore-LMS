# PHASE 2 TENANT ISOLATION — AI Implementation Prompts

> **Status: SHIPPED** — Phase 2 tenant isolation implemented as of v0.20.x (COUNCIL-2025-015). Cross-tenant RLS penetration tests, storage bucket isolation, and rate limiting are live. This is an archived implementation prompt file.

**Council:** COUNCIL-2025-015 (7/7 unanimous)
**ADR:** ADR-2025-009
**Date:** 2026-06-18

Three self-contained prompts. Run in order. Each produces one migration file.

---

## Security Preamble (applies to ALL three prompts)

- RLS is the security source of truth. Never `SET row_security = off`.
- Service role key is server-side only. Never in client components.
- `is_platform_admin()` reads ONLY `platform_admins` — never `profiles.role`.
- Every policy MUST include: `public.is_platform_admin() OR public.current_user_org_id() = org_id`
- Do not modify data model without a migration file.
- Helper functions already exist: `current_user_org_id()`, `current_user_uid()`,
  `current_user_role()`, `is_platform_admin()` — use them, do not redefine.
- All migrations must be idempotent: `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS`,
  `CREATE INDEX IF NOT EXISTS`.
- Default-remaining NULL org_id rows to `(SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)`.

---

## PROMPT 1 — Migration 20260618200400: Course Content + HQ Tables

Create the file `supabase/migrations/20260618200400_phase2_course_content_hq_rls.sql`.

### Tables to isolate

**Group A — Course content (backfill via `course_id → courses.org_id`):**

`modules` — has `course_id uuid REFERENCES public.courses(id)`. RLS policy to replace:
`"modules: enrolled or staff read"` (role-only) and `"modules: staff manage"` (role-only).

New policies:
- SELECT: `is_platform_admin() OR (current_user_org_id() = org_id AND (current_user_role() IN ('admin','manager','teacher') OR EXISTS (SELECT 1 FROM public.course_enrollments ce WHERE ce.user_id = current_user_uid() AND ce.course_id = modules.course_id)))`
- ALL staff: `(is_platform_admin() OR current_user_org_id() = org_id) AND current_user_role() IN ('admin','manager','teacher')`

`course_blocks` — has `course_id uuid`. Drop: `"course_blocks: staff view all"`,
`"course_blocks: enrolled students view"`, `"course_blocks: owners manage"`.

New policies:
- SELECT staff: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager','teacher'))`
- SELECT students: `current_user_org_id() = org_id AND EXISTS (SELECT 1 FROM public.course_enrollments ce WHERE ce.user_id = current_user_uid() AND ce.course_id = course_blocks.course_id AND ce.status = 'active')`
- ALL manage: `(is_platform_admin() OR current_user_org_id() = org_id) AND (current_user_role() IN ('admin','teacher') OR EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_blocks.course_id AND c.owner_id = current_user_uid()))`

`content_pages` — has `course_id uuid REFERENCES public.course_blueprints(id)`. 
Backfill: join `course_blueprints cb ON cb.id = content_pages.course_id` then
`profiles p ON p.auth_id = cb.created_by` → `p.org_id`.
Drop existing policies. New:
- SELECT: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager','teacher'))`
- ALL manage: `(is_platform_admin() OR current_user_org_id() = org_id) AND current_user_role() IN ('admin','manager','teacher')`

`submissions` (legacy, distinct from `block_submissions`) — has `course_id` and `student_id`.
Backfill via `courses.org_id` through `course_id`.
Drop: `"submissions: self manage"`, `"submissions: staff manage"`.
New:
- ALL self: `student_id = current_user_uid() AND current_user_org_id() = org_id`
- SELECT staff: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager','teacher'))`

**Group B — HQ governance (backfill via `created_by → auth.users → profiles.auth_id → profiles.org_id`):**

Backfill SQL pattern for this group:
```sql
UPDATE public.<table> t
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = t.created_by
  AND t.org_id IS NULL
  AND p.org_id IS NOT NULL;
```

`hq_tasks` — has `created_by uuid REFERENCES auth.users(id)`.
Drop: `"hq_tasks: staff read all"`, `"hq_tasks: managers+ write"`,
`"hq_tasks: managers+ update"`, `"hq_tasks: admins delete"`.
New:
- SELECT: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager','teacher'))`
- INSERT: `(is_platform_admin() OR current_user_org_id() = org_id) AND current_user_role() IN ('admin','manager')`
- UPDATE: same as INSERT
- DELETE: `(is_platform_admin() OR current_user_org_id() = org_id) AND current_user_role() = 'admin'`

`hq_decisions` — has `created_by`. Same backfill and same 4-policy pattern as hq_tasks.
Drop existing policies (check names in migration 20240601000009 and drop IF EXISTS).

`hq_risks` — has `created_by`. Same backfill and same 4-policy pattern.

`hq_sessions` — has `user_id uuid REFERENCES auth.users(id)`.
Backfill: `UPDATE hq_sessions s SET org_id = p.org_id FROM public.profiles p WHERE p.auth_id = s.user_id AND s.org_id IS NULL AND p.org_id IS NOT NULL;`
Drop: `"hq_sessions: users manage own"`, `"hq_sessions: admins read all"`,
`"users manage their own hq sessions"`, `"admins can view all hq sessions"`.
New:
- SELECT own: `user_id = auth.uid() AND current_user_org_id() = org_id`
- SELECT admin: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager'))`
- ALL own: `user_id = auth.uid() AND current_user_org_id() = org_id`

### Acceptance criteria

- [ ] `supabase db push` applies cleanly (NOTICEs OK, no ERROR)
- [ ] A teacher from a different org cannot SELECT from modules, course_blocks, hq_tasks, hq_decisions, hq_risks, hq_sessions
- [ ] A student enrolled in a course can read that course's modules and course_blocks
- [ ] Platform admin can read all rows in all 8 tables
- [ ] All policies include `is_platform_admin() OR current_user_org_id() = org_id`

---

## PROMPT 2 — Migration 20260618200500: Academic Structure + Collaboration

Create the file `supabase/migrations/20260618200500_phase2_academic_structure_rls.sql`.

### Tables to isolate

**Group A — Academic structure (backfill via `created_by → profiles.auth_id → profiles.org_id`):**

```sql
-- Reusable backfill pattern for created_by tables:
UPDATE public.<table> t
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = t.created_by
  AND t.org_id IS NULL
  AND p.org_id IS NOT NULL;
```

Tables: `academic_terms`, `program_tracks`, `course_blueprints`, `course_sections`.

For each: drop all existing policies, add org_id, backfill, SET NOT NULL, add index.

RLS pattern for each:
- SELECT admin/manager: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager'))`
- SELECT teacher/student (read active): `current_user_org_id() = org_id AND (is_active = TRUE OR current_user_role() IN ('admin','manager'))`
- ALL manage: `(is_platform_admin() OR current_user_org_id() = org_id) AND current_user_role() IN ('admin','manager')`

`access_windows` — no `created_by`. Backfill via `section_id → course_sections.org_id`:
```sql
UPDATE public.access_windows aw
SET org_id = cs.org_id
FROM public.course_sections cs
WHERE aw.section_id = cs.id AND aw.org_id IS NULL;
```
Drop existing policies. New:
- SELECT: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager','teacher'))`
- ALL manage: `(is_platform_admin() OR current_user_org_id() = org_id) AND current_user_role() IN ('admin','manager')`

`meeting_schedules` — same backfill via `section_id → course_sections.org_id`. Same policy pattern as access_windows.

**Group B — Cohorts and enrollment tables:**

`global_cohorts` — has `created_by`. Backfill via created_by → profiles.
Drop: `"admin_manager_all_cohorts"`, `"teacher_read_cohorts"`.
New:
- SELECT: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager','teacher'))`
- ALL manage: `(is_platform_admin() OR current_user_org_id() = org_id) AND current_user_role() IN ('admin','manager')`

`cohort_members` — has `user_id uuid REFERENCES auth.users(id)`.
Backfill: join to `global_cohorts` via `cohort_id → global_cohorts.org_id`.
```sql
UPDATE public.cohort_members cm
SET org_id = gc.org_id
FROM public.global_cohorts gc
WHERE cm.cohort_id = gc.id AND cm.org_id IS NULL;
```
Drop: `"admin_manager_all_cohort_members"`, `"teacher_read_cohort_members"`,
`"learner_read_own_cohort_membership"`.
New:
- SELECT self: `user_id = auth.uid() AND current_user_org_id() = org_id`
- SELECT staff: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager','teacher'))`
- ALL manage: `(is_platform_admin() OR current_user_org_id() = org_id) AND current_user_role() IN ('admin','manager')`

`cohort_section_enrollments` — no direct user link. Backfill via `section_id → course_sections.org_id`.
Drop: `"admin_manager_all_cse"`, `"teacher_read_cse"`.
New: same staff/manage pattern.

`direct_enrollments` — has `user_id uuid REFERENCES auth.users(id)`.
Backfill via `user_id → auth.users → profiles.auth_id → profiles.org_id`.
Drop: `"admin_manager_all_direct_enrollments"`, `"teacher_read_direct_enrollments"`, `"learner_read_own_enrollment"`.
New:
- SELECT self: `user_id = auth.uid() AND current_user_org_id() = org_id`
- SELECT staff: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager','teacher'))`
- ALL manage: `(is_platform_admin() OR current_user_org_id() = org_id) AND current_user_role() IN ('admin','manager')`

`enrollment_jobs` — backfill via `section_id → course_sections.org_id`.
Drop existing policies. New: staff read/manage pattern.

`enrollment_audit_log` — has bare `user_id uuid` (NOT a FK — join on `profiles.uid`, NOT `profiles.auth_id`).
```sql
UPDATE public.enrollment_audit_log eal
SET org_id = p.org_id
FROM public.profiles p
WHERE p.uid = eal.user_id      -- uid, NOT auth_id
  AND eal.org_id IS NULL
  AND p.org_id IS NOT NULL;
```
New:
- SELECT: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager'))`
- INSERT service_role: `WITH CHECK (true) TO service_role`

**Group C — Section collaboration (backfill cascades from sections down):**

`section_groups` — has `section_id`. Backfill via `section_id → course_sections.org_id`.
Drop existing policies. New:
- SELECT: `current_user_org_id() = org_id AND (current_user_role() IN ('admin','manager','teacher') OR id IN (SELECT group_id FROM public.section_group_members WHERE user_id = current_user_uid()))`
- ALL manage: `(is_platform_admin() OR current_user_org_id() = org_id) AND current_user_role() IN ('admin','manager','teacher')`

`section_group_members` — backfill via `group_id → section_groups.org_id`.
Drop existing policies. New:
- SELECT: `current_user_org_id() = org_id AND (current_user_role() IN ('admin','manager','teacher') OR user_id = current_user_uid())`
- INSERT own: `user_id = current_user_uid() AND current_user_org_id() = org_id`
- ALL manage: `(is_platform_admin() OR current_user_org_id() = org_id) AND current_user_role() IN ('admin','manager','teacher')`

`group_threads` — backfill via `group_id → section_groups.org_id`.
Drop existing policies. New:
- SELECT: `current_user_org_id() = org_id AND group_id IN (SELECT group_id FROM public.section_group_members WHERE user_id = current_user_uid())`
- INSERT: `current_user_org_id() = org_id AND group_id IN (SELECT group_id FROM public.section_group_members WHERE user_id = current_user_uid())`

`group_posts` — backfill via `thread_id → group_threads.org_id`.
Same member-access pattern as group_threads.

### Acceptance criteria

- [ ] `supabase db push` applies cleanly
- [ ] Admin from Tenant A cannot read Tenant B's academic_terms, program_tracks, blueprints, sections, cohorts, or enrollment records
- [ ] Student can read their own enrollment and cohort membership
- [ ] Section group members can read group threads; non-members cannot
- [ ] All 16 tables have org_id NOT NULL after migration

---

## PROMPT 3 — Migration 20260618200600: AI / Analytics / Audit / Rewards

Create the file `supabase/migrations/20260618200600_phase2_ai_analytics_audit_rls.sql`.

### Tables to isolate

**Group A — AI and embeddings:**

`embeddings` — polymorphic `source_id` (no FK). Backfill only where resolvable:
```sql
-- source_type = 'course_block'
UPDATE public.embeddings e
SET org_id = c.org_id
FROM public.course_blocks cb
JOIN public.courses c ON c.id = cb.course_id
WHERE e.source_type = 'course_block'
  AND e.source_id = cb.id
  AND e.org_id IS NULL;

-- source_type = 'content_page'
UPDATE public.embeddings e
SET org_id = p.org_id
FROM public.content_pages cp
JOIN public.course_blueprints cb ON cb.id = cp.course_id
JOIN public.profiles p ON p.auth_id = cb.created_by
WHERE e.source_type = 'content_page'
  AND e.source_id = cp.id
  AND e.org_id IS NULL
  AND p.org_id IS NOT NULL;

-- Default remaining
UPDATE public.embeddings
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;
```
Drop existing policies. New:
- SELECT: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager','teacher'))`
- INSERT service_role: `WITH CHECK (true) TO service_role`

`embedding_jobs` — has `section_id`. Backfill via `section_id → course_sections.org_id`.
If `section_id` is NULL, fall back to first org.
New: same staff-read + service_role-insert pattern.

`ai_query_log` — has `user_id uuid REFERENCES auth.users(id)`.
Backfill via `user_id → auth.users → profiles.auth_id → profiles.org_id`.
Drop existing policies. New:
- SELECT own: `user_id = auth.uid() AND current_user_org_id() = org_id`
- SELECT admin: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager'))`
- INSERT service_role: `WITH CHECK (true) TO service_role`

**Group B — Analytics:**

`analytics_events` — IMPORTANT: org_id column likely exists already (5 refs in migrations)
but verify `CREATE POLICY` statements referencing org_id exist. If policies are missing,
add them without re-adding the column:
```sql
-- Only add if column does not exist
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
-- Backfill if needed (user_id → profiles)
UPDATE public.analytics_events ae
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = ae.user_id
  AND ae.org_id IS NULL
  AND p.org_id IS NOT NULL;
```
Drop any existing policies. New:
- SELECT: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager'))`
- INSERT authenticated: `current_user_org_id() = org_id`
- INSERT service_role: `WITH CHECK (true) TO service_role`

**Group C — Audit logs:**

`admin_audit_log` and `user_audit_log` — likely have `user_id uuid` (bare, not FK).
Backfill via `profiles.uid = user_id` (uid, NOT auth_id):
```sql
UPDATE public.admin_audit_log t
SET org_id = p.org_id
FROM public.profiles p
WHERE p.uid = t.user_id AND t.org_id IS NULL AND p.org_id IS NOT NULL;
```
Same for `user_audit_log`.

New policies for both:
- SELECT: `is_platform_admin() OR (current_user_org_id() = org_id AND current_user_role() IN ('admin','manager'))`
- INSERT service_role: `WITH CHECK (true) TO service_role`

**Group D — User rewards:**

`profile_badges` — `badge_id` references `badges` (platform-global). The award record
itself is org-contextualized. Has `user_id` or `profile_uid` — check actual column name.
Backfill via user column → profiles.org_id.
New:
- SELECT own: `<user_col> = current_user_uid() AND current_user_org_id() = org_id`
- SELECT staff: `current_user_org_id() = org_id AND current_user_role() IN ('admin','manager','teacher')`
- INSERT service_role: `WITH CHECK (true) TO service_role`

### Acceptance criteria

- [ ] `supabase db push` applies cleanly
- [ ] Embeddings for Tenant A's course blocks are not readable by Tenant B's teacher
- [ ] AI query log entries are only visible to the querying user or their org's admin
- [ ] Admin audit logs are scoped to the admin's own org
- [ ] profile_badges for a user are only visible within that user's org
- [ ] `badges` table is NOT modified (remains platform-global)
- [ ] All 8 tables have org_id NOT NULL after migration
- [ ] `report_definitions` and `report_artifacts` — query their existing policies and
  confirm `org_id` appears in at least one USING clause; document result

---

## After all 3 prompts complete

Run the full evaluation query:

```sql
-- Confirm every RLS-enabled table in the target list has a policy referencing org_id
SELECT
  tablename,
  array_agg(policyname ORDER BY policyname) AS policies,
  bool_or(qual::text LIKE '%org_id%') AS has_org_id_in_policy
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'modules','course_blocks','content_pages','submissions',
    'hq_tasks','hq_decisions','hq_risks','hq_sessions',
    'academic_terms','program_tracks','course_blueprints','course_sections',
    'access_windows','meeting_schedules','global_cohorts','cohort_members',
    'cohort_section_enrollments','direct_enrollments','enrollment_jobs','enrollment_audit_log',
    'section_groups','section_group_members','group_threads','group_posts',
    'embeddings','embedding_jobs','ai_query_log','analytics_events',
    'admin_audit_log','user_audit_log','profile_badges'
  )
GROUP BY tablename
ORDER BY tablename;
```

Every row must show `has_org_id_in_policy = true`. Any `false` row is a blocking issue.
