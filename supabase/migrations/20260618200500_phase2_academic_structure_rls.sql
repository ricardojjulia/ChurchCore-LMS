-- ─── Phase 2 Migration 2: Academic structure + collaboration org_id isolation ──
-- Tables (in backfill dependency order):
--   program_tracks, academic_terms, course_blueprints, course_sections,
--   global_cohorts, access_windows, meeting_schedules, cohort_members,
--   cohort_section_enrollments, direct_enrollments, enrollment_jobs,
--   enrollment_audit_log, section_groups, section_group_members,
--   group_threads, group_posts
-- Backfill anchor: course_sections must have org_id before section_id lookups.
-- program_tracks / academic_terms / course_blueprints / course_sections / global_cohorts
--   all backfill via created_by → profiles.auth_id → profiles.org_id

-- ─── PROGRAM_TRACKS ───────────────────────────────────────────────────────────
ALTER TABLE public.program_tracks
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.program_tracks t
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = t.created_by
  AND t.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.program_tracks
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.program_tracks ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_program_tracks_org ON public.program_tracks(org_id);

DROP POLICY IF EXISTS "admin_manager_all_program_tracks"          ON public.program_tracks;
DROP POLICY IF EXISTS "authenticated_read_active_program_tracks"  ON public.program_tracks;

CREATE POLICY "program_tracks: staff read own org"
  ON public.program_tracks FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "program_tracks: learners read active own org"
  ON public.program_tracks FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND is_active = TRUE
  );

CREATE POLICY "program_tracks: managers manage own org"
  ON public.program_tracks FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

-- ─── ACADEMIC_TERMS ───────────────────────────────────────────────────────────
ALTER TABLE public.academic_terms
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.academic_terms t
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = t.created_by
  AND t.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.academic_terms
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.academic_terms ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_academic_terms_org ON public.academic_terms(org_id);

DROP POLICY IF EXISTS "admin_manager_all_academic_terms"         ON public.academic_terms;
DROP POLICY IF EXISTS "authenticated_read_active_academic_terms" ON public.academic_terms;

CREATE POLICY "academic_terms: staff read own org"
  ON public.academic_terms FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "academic_terms: learners read active own org"
  ON public.academic_terms FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND is_active = TRUE
  );

CREATE POLICY "academic_terms: managers manage own org"
  ON public.academic_terms FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

-- ─── COURSE_BLUEPRINTS ────────────────────────────────────────────────────────
ALTER TABLE public.course_blueprints
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.course_blueprints t
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = t.created_by
  AND t.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.course_blueprints
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.course_blueprints ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_course_blueprints_org ON public.course_blueprints(org_id);

DROP POLICY IF EXISTS "admin_manager_all_blueprints" ON public.course_blueprints;
DROP POLICY IF EXISTS "teacher_read_blueprints"      ON public.course_blueprints;
DROP POLICY IF EXISTS "learner_read_active_blueprints" ON public.course_blueprints;

CREATE POLICY "course_blueprints: staff read own org"
  ON public.course_blueprints FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "course_blueprints: learners read active own org"
  ON public.course_blueprints FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND is_active = TRUE
  );

CREATE POLICY "course_blueprints: managers manage own org"
  ON public.course_blueprints FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

-- ─── COURSE_SECTIONS ──────────────────────────────────────────────────────────
-- MUST be done before any table that backlills via section_id → course_sections.org_id
ALTER TABLE public.course_sections
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.course_sections t
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = t.created_by
  AND t.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.course_sections
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.course_sections ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_course_sections_org ON public.course_sections(org_id);

DROP POLICY IF EXISTS "admin_manager_all_sections"   ON public.course_sections;
DROP POLICY IF EXISTS "teacher_read_sections"        ON public.course_sections;
DROP POLICY IF EXISTS "learner_read_active_sections" ON public.course_sections;

CREATE POLICY "course_sections: staff read own org"
  ON public.course_sections FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "course_sections: learners read active own org"
  ON public.course_sections FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND is_active = TRUE
  );

CREATE POLICY "course_sections: managers manage own org"
  ON public.course_sections FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

-- ─── GLOBAL_COHORTS ───────────────────────────────────────────────────────────
ALTER TABLE public.global_cohorts
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.global_cohorts t
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = t.created_by
  AND t.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.global_cohorts
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.global_cohorts ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_global_cohorts_org ON public.global_cohorts(org_id);

DROP POLICY IF EXISTS "admin_manager_all_cohorts" ON public.global_cohorts;
DROP POLICY IF EXISTS "teacher_read_cohorts"      ON public.global_cohorts;

CREATE POLICY "global_cohorts: staff read own org"
  ON public.global_cohorts FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "global_cohorts: managers manage own org"
  ON public.global_cohorts FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

-- ─── ACCESS_WINDOWS ───────────────────────────────────────────────────────────
ALTER TABLE public.access_windows
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.access_windows aw
SET org_id = cs.org_id
FROM public.course_sections cs
WHERE aw.section_id = cs.id AND aw.org_id IS NULL;

UPDATE public.access_windows
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.access_windows ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_access_windows_org ON public.access_windows(org_id);

DROP POLICY IF EXISTS "admin_manager_all_access_windows" ON public.access_windows;
DROP POLICY IF EXISTS "teacher_read_access_windows"      ON public.access_windows;

CREATE POLICY "access_windows: staff read own org"
  ON public.access_windows FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "access_windows: managers manage own org"
  ON public.access_windows FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

-- ─── MEETING_SCHEDULES ────────────────────────────────────────────────────────
ALTER TABLE public.meeting_schedules
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.meeting_schedules ms
SET org_id = cs.org_id
FROM public.course_sections cs
WHERE ms.section_id = cs.id AND ms.org_id IS NULL;

UPDATE public.meeting_schedules
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.meeting_schedules ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meeting_schedules_org ON public.meeting_schedules(org_id);

DROP POLICY IF EXISTS "admin_manager_all_meeting_schedules" ON public.meeting_schedules;
DROP POLICY IF EXISTS "teacher_read_meeting_schedules"      ON public.meeting_schedules;
DROP POLICY IF EXISTS "learner_read_meeting_schedules"      ON public.meeting_schedules;

CREATE POLICY "meeting_schedules: staff read own org"
  ON public.meeting_schedules FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "meeting_schedules: learners read own org"
  ON public.meeting_schedules FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND EXISTS (
      SELECT 1 FROM public.direct_enrollments de
      WHERE de.section_id = meeting_schedules.section_id
        AND de.user_id = auth.uid()
        AND de.status = 'active'
    )
  );

CREATE POLICY "meeting_schedules: managers manage own org"
  ON public.meeting_schedules FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

-- ─── COHORT_MEMBERS ───────────────────────────────────────────────────────────
ALTER TABLE public.cohort_members
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.cohort_members cm
SET org_id = gc.org_id
FROM public.global_cohorts gc
WHERE cm.cohort_id = gc.id AND cm.org_id IS NULL;

UPDATE public.cohort_members
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.cohort_members ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cohort_members_org ON public.cohort_members(org_id);

DROP POLICY IF EXISTS "admin_manager_all_cohort_members"    ON public.cohort_members;
DROP POLICY IF EXISTS "teacher_read_cohort_members"         ON public.cohort_members;
DROP POLICY IF EXISTS "learner_read_own_cohort_membership"  ON public.cohort_members;

CREATE POLICY "cohort_members: staff read own org"
  ON public.cohort_members FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "cohort_members: learners read own"
  ON public.cohort_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "cohort_members: managers manage own org"
  ON public.cohort_members FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

-- ─── COHORT_SECTION_ENROLLMENTS ───────────────────────────────────────────────
ALTER TABLE public.cohort_section_enrollments
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.cohort_section_enrollments cse
SET org_id = cs.org_id
FROM public.course_sections cs
WHERE cse.section_id = cs.id AND cse.org_id IS NULL;

UPDATE public.cohort_section_enrollments
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.cohort_section_enrollments ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cse_org ON public.cohort_section_enrollments(org_id);

DROP POLICY IF EXISTS "admin_manager_all_cse" ON public.cohort_section_enrollments;
DROP POLICY IF EXISTS "teacher_read_cse"      ON public.cohort_section_enrollments;

CREATE POLICY "cohort_section_enrollments: staff read own org"
  ON public.cohort_section_enrollments FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "cohort_section_enrollments: managers manage own org"
  ON public.cohort_section_enrollments FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

-- ─── DIRECT_ENROLLMENTS ───────────────────────────────────────────────────────
ALTER TABLE public.direct_enrollments
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.direct_enrollments de
SET org_id = cs.org_id
FROM public.course_sections cs
WHERE de.section_id = cs.id AND de.org_id IS NULL;

UPDATE public.direct_enrollments
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.direct_enrollments ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_direct_enrollments_org ON public.direct_enrollments(org_id);

DROP POLICY IF EXISTS "admin_manager_all_direct_enrollments" ON public.direct_enrollments;
DROP POLICY IF EXISTS "teacher_read_direct_enrollments"      ON public.direct_enrollments;
DROP POLICY IF EXISTS "learner_read_own_enrollment"          ON public.direct_enrollments;

CREATE POLICY "direct_enrollments: staff read own org"
  ON public.direct_enrollments FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "direct_enrollments: learners read own"
  ON public.direct_enrollments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "direct_enrollments: managers manage own org"
  ON public.direct_enrollments FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

-- ─── ENROLLMENT_JOBS ──────────────────────────────────────────────────────────
ALTER TABLE public.enrollment_jobs
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.enrollment_jobs ej
SET org_id = cs.org_id
FROM public.course_sections cs
WHERE ej.section_id = cs.id AND ej.org_id IS NULL;

UPDATE public.enrollment_jobs
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.enrollment_jobs ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrollment_jobs_org ON public.enrollment_jobs(org_id);

DROP POLICY IF EXISTS "admin_manager_all_enrollment_jobs" ON public.enrollment_jobs;

CREATE POLICY "enrollment_jobs: staff read own org"
  ON public.enrollment_jobs FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager')
    )
  );

CREATE POLICY "enrollment_jobs: managers manage own org"
  ON public.enrollment_jobs FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

-- ─── ENROLLMENT_AUDIT_LOG ─────────────────────────────────────────────────────
-- user_id and section_id are bare uuids (no FK). Backfill via section_id JOIN.
ALTER TABLE public.enrollment_audit_log
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.enrollment_audit_log eal
SET org_id = cs.org_id
FROM public.course_sections cs
WHERE cs.id = eal.section_id AND eal.org_id IS NULL;

UPDATE public.enrollment_audit_log
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.enrollment_audit_log ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrollment_audit_log_org ON public.enrollment_audit_log(org_id);

DROP POLICY IF EXISTS "admin_manager_read_audit_log" ON public.enrollment_audit_log;
DROP POLICY IF EXISTS "system_insert_audit_log"      ON public.enrollment_audit_log;

CREATE POLICY "enrollment_audit_log: managers read own org"
  ON public.enrollment_audit_log FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager')
    )
  );

CREATE POLICY "enrollment_audit_log: system insert own org"
  ON public.enrollment_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR public.current_user_org_id() = org_id
  );

-- ─── SECTION_GROUPS ───────────────────────────────────────────────────────────
ALTER TABLE public.section_groups
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.section_groups sg
SET org_id = cs.org_id
FROM public.course_sections cs
WHERE sg.section_id = cs.id AND sg.org_id IS NULL;

UPDATE public.section_groups
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.section_groups ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_section_groups_org ON public.section_groups(org_id);

DROP POLICY IF EXISTS "admin_manager_all_section_groups" ON public.section_groups;
DROP POLICY IF EXISTS "teacher_all_section_groups"       ON public.section_groups;
DROP POLICY IF EXISTS "learner_read_own_section_groups"  ON public.section_groups;

CREATE POLICY "section_groups: staff read own org"
  ON public.section_groups FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "section_groups: learners read own"
  ON public.section_groups FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.is_group_member(id)
  );

CREATE POLICY "section_groups: teachers manage own org"
  ON public.section_groups FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

-- ─── SECTION_GROUP_MEMBERS ────────────────────────────────────────────────────
-- group_id → section_groups.org_id (section_groups now has org_id)
ALTER TABLE public.section_group_members
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.section_group_members sgm
SET org_id = sg.org_id
FROM public.section_groups sg
WHERE sgm.group_id = sg.id AND sgm.org_id IS NULL;

UPDATE public.section_group_members
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.section_group_members ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_section_group_members_org ON public.section_group_members(org_id);

DROP POLICY IF EXISTS "admin_manager_all_group_members" ON public.section_group_members;
DROP POLICY IF EXISTS "teacher_all_group_members"       ON public.section_group_members;
DROP POLICY IF EXISTS "learner_read_own_membership"     ON public.section_group_members;

CREATE POLICY "section_group_members: staff read own org"
  ON public.section_group_members FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "section_group_members: learners read own"
  ON public.section_group_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "section_group_members: managers manage own org"
  ON public.section_group_members FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

-- ─── GROUP_THREADS ────────────────────────────────────────────────────────────
ALTER TABLE public.group_threads
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.group_threads gt
SET org_id = sg.org_id
FROM public.section_groups sg
WHERE gt.group_id = sg.id AND gt.org_id IS NULL;

UPDATE public.group_threads
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.group_threads ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_group_threads_org ON public.group_threads(org_id);

DROP POLICY IF EXISTS "admin_manager_all_group_threads" ON public.group_threads;
DROP POLICY IF EXISTS "teacher_all_group_threads"       ON public.group_threads;
DROP POLICY IF EXISTS "group_member_read_threads"       ON public.group_threads;
DROP POLICY IF EXISTS "group_member_insert_threads"     ON public.group_threads;
DROP POLICY IF EXISTS "group_member_delete_own_thread"  ON public.group_threads;
DROP POLICY IF EXISTS "teacher_update_thread_flags"     ON public.group_threads;

CREATE POLICY "group_threads: staff read own org"
  ON public.group_threads FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "group_threads: members read own org"
  ON public.group_threads FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.is_group_member(group_id)
  );

CREATE POLICY "group_threads: members insert own org"
  ON public.group_threads FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND public.is_group_member(group_id)
  );

CREATE POLICY "group_threads: members delete own own org"
  ON public.group_threads FOR DELETE TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND created_by = auth.uid()
  );

CREATE POLICY "group_threads: teachers moderate own org"
  ON public.group_threads FOR UPDATE TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

-- ─── GROUP_POSTS ──────────────────────────────────────────────────────────────
ALTER TABLE public.group_posts
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.group_posts gp
SET org_id = sg.org_id
FROM public.section_groups sg
WHERE gp.group_id = sg.id AND gp.org_id IS NULL;

UPDATE public.group_posts
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.group_posts ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_group_posts_org ON public.group_posts(org_id);

DROP POLICY IF EXISTS "admin_manager_all_group_posts" ON public.group_posts;
DROP POLICY IF EXISTS "teacher_all_group_posts"       ON public.group_posts;
DROP POLICY IF EXISTS "group_member_read_posts"       ON public.group_posts;
DROP POLICY IF EXISTS "group_member_insert_posts"     ON public.group_posts;
DROP POLICY IF EXISTS "author_update_own_post"        ON public.group_posts;

CREATE POLICY "group_posts: staff read own org"
  ON public.group_posts FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "group_posts: members read own org"
  ON public.group_posts FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.is_group_member(group_id)
  );

CREATE POLICY "group_posts: members insert own org"
  ON public.group_posts FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND public.is_group_member(group_id)
  );

CREATE POLICY "group_posts: authors update own org"
  ON public.group_posts FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    AND public.current_user_org_id() = org_id
  )
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "group_posts: teachers moderate own org"
  ON public.group_posts FOR UPDATE TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

CREATE POLICY "group_posts: staff delete own org"
  ON public.group_posts FOR DELETE TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  );
