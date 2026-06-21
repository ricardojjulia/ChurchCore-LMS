-- ─── Phase 2 Migration 1: Course content + HQ table org_id isolation ─────────
-- Tables: modules, course_blocks, content_pages, submissions,
--         hq_tasks, hq_decisions, hq_risks, hq_sessions
-- All backfill from closest org-linked ancestor, then rewrite RLS.

-- ─── MODULES ─────────────────────────────────────────────────────────────────
ALTER TABLE public.modules
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.modules m
SET org_id = c.org_id
FROM public.courses c
WHERE m.course_id = c.id AND m.org_id IS NULL;

UPDATE public.modules
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.modules ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_modules_org ON public.modules(org_id);

DROP POLICY IF EXISTS "modules: enrolled or staff read"       ON public.modules;
DROP POLICY IF EXISTS "modules: staff manage"                 ON public.modules;
DROP POLICY IF EXISTS "Enrolled students can view modules"    ON public.modules;
DROP POLICY IF EXISTS "Teachers and admins can manage modules" ON public.modules;

CREATE POLICY "modules: staff read own org"
  ON public.modules FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "modules: students read own org"
  ON public.modules FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND EXISTS (
      SELECT 1 FROM public.course_enrollments ce
      WHERE ce.user_id = public.current_user_uid()
        AND ce.course_id = modules.course_id
        AND ce.status = 'active'
    )
  );

CREATE POLICY "modules: staff manage own org"
  ON public.modules FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

-- ─── COURSE_BLOCKS ────────────────────────────────────────────────────────────
ALTER TABLE public.course_blocks
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.course_blocks cb
SET org_id = c.org_id
FROM public.courses c
WHERE cb.course_id = c.id AND cb.org_id IS NULL;

UPDATE public.course_blocks
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.course_blocks ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_course_blocks_org ON public.course_blocks(org_id);

DROP POLICY IF EXISTS "course_blocks: staff view all"          ON public.course_blocks;
DROP POLICY IF EXISTS "course_blocks: enrolled students view"  ON public.course_blocks;
DROP POLICY IF EXISTS "course_blocks: owners manage"           ON public.course_blocks;
DROP POLICY IF EXISTS "staff can view all blocks"              ON public.course_blocks;
DROP POLICY IF EXISTS "course owners can manage their blocks"  ON public.course_blocks;
DROP POLICY IF EXISTS "enrolled students can view course blocks" ON public.course_blocks;

CREATE POLICY "course_blocks: staff read own org"
  ON public.course_blocks FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "course_blocks: students read own org"
  ON public.course_blocks FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND EXISTS (
      SELECT 1 FROM public.course_enrollments ce
      WHERE ce.user_id = public.current_user_uid()
        AND ce.course_id = course_blocks.course_id
        AND ce.status = 'active'
    )
  );

CREATE POLICY "course_blocks: manage own org"
  ON public.course_blocks FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND (
      public.current_user_role() IN ('admin','manager')
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_blocks.course_id
          AND c.owner_id = public.current_user_uid()
      )
    )
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND (
      public.current_user_role() IN ('admin','manager')
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_blocks.course_id
          AND c.owner_id = public.current_user_uid()
      )
    )
  );

-- ─── CONTENT_PAGES ───────────────────────────────────────────────────────────
ALTER TABLE public.content_pages
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.content_pages cp
SET org_id = p.org_id
FROM public.course_blueprints cb
JOIN public.profiles p ON p.auth_id = cb.created_by
WHERE cp.course_id = cb.id
  AND cp.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.content_pages
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.content_pages ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_pages_org ON public.content_pages(org_id);

DROP POLICY IF EXISTS "content_pages: staff read"   ON public.content_pages;
DROP POLICY IF EXISTS "content_pages: staff manage" ON public.content_pages;

CREATE POLICY "content_pages: staff read own org"
  ON public.content_pages FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "content_pages: staff manage own org"
  ON public.content_pages FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

-- ─── SUBMISSIONS (legacy) ────────────────────────────────────────────────────
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.submissions s
SET org_id = c.org_id
FROM public.courses c
WHERE s.course_id = c.id AND s.org_id IS NULL;

UPDATE public.submissions
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.submissions ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_org ON public.submissions(org_id);

DROP POLICY IF EXISTS "submissions: self manage"                           ON public.submissions;
DROP POLICY IF EXISTS "submissions: staff manage"                          ON public.submissions;
DROP POLICY IF EXISTS "Students can view and create their own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Teachers and admins can view and grade all submissions" ON public.submissions;
DROP POLICY IF EXISTS "students manage their submissions"                  ON public.submissions;
DROP POLICY IF EXISTS "staff view all submissions"                         ON public.submissions;

CREATE POLICY "submissions: students manage own"
  ON public.submissions FOR ALL TO authenticated
  USING  (student_id = public.current_user_uid() AND public.current_user_org_id() = org_id)
  WITH CHECK (student_id = public.current_user_uid() AND public.current_user_org_id() = org_id);

CREATE POLICY "submissions: staff read own org"
  ON public.submissions FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "submissions: staff grade own org"
  ON public.submissions FOR UPDATE TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

-- ─── HQ_TASKS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.hq_tasks
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.hq_tasks t
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = t.created_by
  AND t.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.hq_tasks
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.hq_tasks ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hq_tasks_org ON public.hq_tasks(org_id);

DROP POLICY IF EXISTS "hq_tasks: staff read all"    ON public.hq_tasks;
DROP POLICY IF EXISTS "hq_tasks: managers+ write"   ON public.hq_tasks;
DROP POLICY IF EXISTS "hq_tasks: managers+ update"  ON public.hq_tasks;
DROP POLICY IF EXISTS "hq_tasks: admins delete"     ON public.hq_tasks;

CREATE POLICY "hq_tasks: staff read own org"
  ON public.hq_tasks FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "hq_tasks: managers write own org"
  ON public.hq_tasks FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

CREATE POLICY "hq_tasks: managers update own org"
  ON public.hq_tasks FOR UPDATE TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

CREATE POLICY "hq_tasks: admins delete own org"
  ON public.hq_tasks FOR DELETE TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() = 'admin'
  );

-- ─── HQ_DECISIONS ─────────────────────────────────────────────────────────────
ALTER TABLE public.hq_decisions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.hq_decisions t
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = t.created_by
  AND t.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.hq_decisions
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.hq_decisions ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hq_decisions_org ON public.hq_decisions(org_id);

DROP POLICY IF EXISTS "hq_decisions: staff read all"   ON public.hq_decisions;
DROP POLICY IF EXISTS "hq_decisions: managers write"   ON public.hq_decisions;
DROP POLICY IF EXISTS "hq_decisions: managers update"  ON public.hq_decisions;
DROP POLICY IF EXISTS "hq_decisions: admins delete"    ON public.hq_decisions;

CREATE POLICY "hq_decisions: staff read own org"
  ON public.hq_decisions FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "hq_decisions: managers write own org"
  ON public.hq_decisions FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

CREATE POLICY "hq_decisions: managers update own org"
  ON public.hq_decisions FOR UPDATE TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

CREATE POLICY "hq_decisions: admins delete own org"
  ON public.hq_decisions FOR DELETE TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() = 'admin'
  );

-- ─── HQ_RISKS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.hq_risks
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.hq_risks t
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = t.created_by
  AND t.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.hq_risks
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.hq_risks ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hq_risks_org ON public.hq_risks(org_id);

DROP POLICY IF EXISTS "hq_risks: staff read all"   ON public.hq_risks;
DROP POLICY IF EXISTS "hq_risks: managers write"   ON public.hq_risks;
DROP POLICY IF EXISTS "hq_risks: managers update"  ON public.hq_risks;
DROP POLICY IF EXISTS "hq_risks: admins delete"    ON public.hq_risks;

CREATE POLICY "hq_risks: staff read own org"
  ON public.hq_risks FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "hq_risks: managers write own org"
  ON public.hq_risks FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

CREATE POLICY "hq_risks: managers update own org"
  ON public.hq_risks FOR UPDATE TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager')
  );

CREATE POLICY "hq_risks: admins delete own org"
  ON public.hq_risks FOR DELETE TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() = 'admin'
  );

-- ─── HQ_SESSIONS ──────────────────────────────────────────────────────────────
ALTER TABLE public.hq_sessions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.hq_sessions s
SET org_id = p.org_id
FROM public.profiles p
WHERE p.auth_id = s.user_id
  AND s.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.hq_sessions
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.hq_sessions ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hq_sessions_org ON public.hq_sessions(org_id);

DROP POLICY IF EXISTS "hq_sessions: users manage own"         ON public.hq_sessions;
DROP POLICY IF EXISTS "hq_sessions: admins read all"          ON public.hq_sessions;
DROP POLICY IF EXISTS "users manage their own hq sessions"    ON public.hq_sessions;
DROP POLICY IF EXISTS "admins can view all hq sessions"       ON public.hq_sessions;

CREATE POLICY "hq_sessions: own org user manages own"
  ON public.hq_sessions FOR ALL TO authenticated
  USING  (user_id = auth.uid() AND public.current_user_org_id() = org_id)
  WITH CHECK (user_id = auth.uid() AND public.current_user_org_id() = org_id);

CREATE POLICY "hq_sessions: admins read own org"
  ON public.hq_sessions FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager')
    )
  );
