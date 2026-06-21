-- ─── Phase 2 Migration 3: AI / analytics / audit / rewards org_id isolation ───
-- Tables: embeddings, embedding_jobs, ai_query_log, admin_audit_log,
--         user_audit_log, profile_badges
-- analytics_events: VERIFIED — org_id + org-scoped RLS already present from
--   migration 20250710090100. No action needed; confirmed via pg_policies.
-- Backfill anchor: course_sections already has org_id (migration 200500).

-- ─── EMBEDDING_JOBS ───────────────────────────────────────────────────────────
ALTER TABLE public.embedding_jobs
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.embedding_jobs ej
SET org_id = cs.org_id
FROM public.course_sections cs
WHERE ej.section_id = cs.id AND ej.org_id IS NULL;

UPDATE public.embedding_jobs
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.embedding_jobs ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_org ON public.embedding_jobs(org_id);

DROP POLICY IF EXISTS "admin_read_embedding_jobs"          ON public.embedding_jobs;
DROP POLICY IF EXISTS "service_role_manage_embedding_jobs" ON public.embedding_jobs;

CREATE POLICY "embedding_jobs: staff read own org"
  ON public.embedding_jobs FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager')
    )
  );

CREATE POLICY "embedding_jobs: service role manage"
  ON public.embedding_jobs FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ─── EMBEDDINGS ───────────────────────────────────────────────────────────────
ALTER TABLE public.embeddings
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.embeddings e
SET org_id = cs.org_id
FROM public.course_sections cs
WHERE e.section_id = cs.id AND e.org_id IS NULL;

UPDATE public.embeddings
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.embeddings ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_embeddings_org ON public.embeddings(org_id);

DROP POLICY IF EXISTS "enrolled_student_read_embeddings" ON public.embeddings;
DROP POLICY IF EXISTS "service_role_manage_embeddings"   ON public.embeddings;

CREATE POLICY "embeddings: enrolled students read own org"
  ON public.embeddings FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND EXISTS (
      SELECT 1 FROM public.direct_enrollments de
      WHERE de.section_id = embeddings.section_id
        -- direct_enrollments.user_id references auth.users(id), not profiles.uid,
        -- so auth.uid() is the correct comparator here (not current_user_uid()).
        AND de.user_id = auth.uid()
        AND de.status = 'active'
    )
  );

CREATE POLICY "embeddings: staff read own org"
  ON public.embeddings FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "embeddings: service role manage"
  ON public.embeddings FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ─── AI_QUERY_LOG ─────────────────────────────────────────────────────────────
ALTER TABLE public.ai_query_log
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.ai_query_log aql
SET org_id = cs.org_id
FROM public.course_sections cs
WHERE aql.section_id = cs.id AND aql.org_id IS NULL;

UPDATE public.ai_query_log
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.ai_query_log ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_query_log_org ON public.ai_query_log(org_id);

DROP POLICY IF EXISTS "admin_read_ai_query_log"          ON public.ai_query_log;
DROP POLICY IF EXISTS "service_role_manage_ai_query_log" ON public.ai_query_log;

CREATE POLICY "ai_query_log: admins read own org"
  ON public.ai_query_log FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager')
    )
  );

CREATE POLICY "ai_query_log: service role manage"
  ON public.ai_query_log FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ─── ADMIN_AUDIT_LOG ──────────────────────────────────────────────────────────
-- actor_id references auth.users(id); backfill via profiles.auth_id → profiles.org_id
ALTER TABLE public.admin_audit_log
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.admin_audit_log al
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = al.actor_id
  AND al.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.admin_audit_log
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.admin_audit_log ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_org ON public.admin_audit_log(org_id);

DROP POLICY IF EXISTS "admins_read_audit_log" ON public.admin_audit_log;

CREATE POLICY "admin_audit_log: admins read own org"
  ON public.admin_audit_log FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager')
    )
  );

-- Service role writes audit entries; no INSERT policy for authenticated users.

-- ─── USER_AUDIT_LOG ───────────────────────────────────────────────────────────
-- actor_uid / target_uid reference profiles(uid) directly.
ALTER TABLE public.user_audit_log
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.user_audit_log ul
SET org_id = p.org_id
FROM public.profiles p
WHERE p.uid = ul.actor_uid
  AND ul.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.user_audit_log
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.user_audit_log ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_audit_log_org ON public.user_audit_log(org_id);

DROP POLICY IF EXISTS "audit: admin read" ON public.user_audit_log;

CREATE POLICY "user_audit_log: admins read own org"
  ON public.user_audit_log FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() = 'admin'
    )
  );

-- ─── PROFILE_BADGES ───────────────────────────────────────────────────────────
-- profile_id references profiles(id) which equals profiles.uid (not auth_id).
ALTER TABLE public.profile_badges
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.profile_badges pb
SET org_id = p.org_id
FROM public.profiles p
WHERE p.uid = pb.profile_id
  AND pb.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.profile_badges
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.profile_badges ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profile_badges_org ON public.profile_badges(org_id);

DROP POLICY IF EXISTS "Users can view all earned badge records" ON public.profile_badges;
DROP POLICY IF EXISTS "Only admins can award badges"           ON public.profile_badges;

CREATE POLICY "profile_badges: read own org"
  ON public.profile_badges FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR public.current_user_org_id() = org_id
  );

CREATE POLICY "profile_badges: admins award own org"
  ON public.profile_badges FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

CREATE POLICY "profile_badges: admins revoke own org"
  ON public.profile_badges FOR DELETE TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

-- ─── VERIFICATION QUERY (run after push to confirm all 30 tables isolated) ────
-- Run this in the Supabase SQL editor to verify:
--
-- SELECT tablename,
--   bool_or(qual LIKE '%org_id%' OR with_check LIKE '%org_id%') AS has_org_id_in_policy
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'modules','course_blocks','content_pages','submissions',
--     'hq_tasks','hq_decisions','hq_risks','hq_sessions',
--     'academic_terms','program_tracks','course_blueprints','course_sections',
--     'access_windows','meeting_schedules','global_cohorts','cohort_members',
--     'cohort_section_enrollments','direct_enrollments','enrollment_jobs',
--     'enrollment_audit_log','section_groups','section_group_members',
--     'group_threads','group_posts',
--     'embeddings','embedding_jobs','ai_query_log',
--     'admin_audit_log','user_audit_log','profile_badges'
--   )
-- GROUP BY tablename
-- ORDER BY tablename;
--
-- Expected: has_org_id_in_policy = true for all 30 rows.
-- analytics_events is NOT in this list — already verified in migration 20250710090100.
