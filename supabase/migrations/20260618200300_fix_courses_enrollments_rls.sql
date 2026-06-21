-- ─── Fix tenant isolation gaps: courses, enrollments, modules ────────────────
-- courses and enrollments had org_id columns but their RLS policies never
-- checked current_user_org_id(), allowing cross-tenant reads by staff.
-- This migration rewrites those policies to enforce org-scoping.

-- ─── COURSES ─────────────────────────────────────────────────────────────────
-- org_id was added (nullable) in 20240601000002. Make it NOT NULL after backfill.

-- Backfill courses from owner's profile org_id (owner_id references profiles.id)
UPDATE public.courses c
SET org_id = p.org_id
FROM public.profiles p
WHERE c.owner_id = p.uid
  AND c.org_id IS NULL
  AND p.org_id IS NOT NULL;

-- Default remaining to first org (single-tenant installs with no created_by)
UPDATE public.courses
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.courses ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "courses: visible to qualified users"              ON public.courses;
DROP POLICY IF EXISTS "courses: teachers and admins can insert"          ON public.courses;
DROP POLICY IF EXISTS "courses: owners and admins can update"            ON public.courses;
DROP POLICY IF EXISTS "courses: owners and admins can delete"            ON public.courses;
DROP POLICY IF EXISTS "courses visible to qualified users"               ON public.courses;
DROP POLICY IF EXISTS "Course owners and admins can delete courses"      ON public.courses;
DROP POLICY IF EXISTS "Course owners can update their courses"           ON public.courses;
DROP POLICY IF EXISTS "Teachers and admins can create courses"           ON public.courses;

CREATE POLICY "courses: staff read own org"
  ON public.courses FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin', 'manager', 'teacher')
    )
  );

CREATE POLICY "courses: students see published own org"
  ON public.courses FOR SELECT
  TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND status = 'published'
    AND public.current_user_level() >= min_required_level
    AND (
      prerequisite_course_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.user_id = public.current_user_uid()
          AND e.course_id = courses.prerequisite_course_id
      )
    )
  );

CREATE POLICY "courses: staff insert own org"
  ON public.courses FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  );

CREATE POLICY "courses: staff update own org"
  ON public.courses FOR UPDATE
  TO authenticated
  USING  (public.current_user_org_id() = org_id AND public.current_user_role() IN ('admin', 'manager', 'teacher'))
  WITH CHECK (public.current_user_org_id() = org_id AND public.current_user_role() IN ('admin', 'manager', 'teacher'));

CREATE POLICY "courses: staff delete own org"
  ON public.courses FOR DELETE
  TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager')
  );

-- ─── ENROLLMENTS ─────────────────────────────────────────────────────────────
-- enrollments table (legacy — the original one from initial_schema.sql)

-- Check whether enrollments has org_id; add if missing
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.enrollments e
SET org_id = p.org_id
FROM public.profiles p
WHERE e.user_id = p.uid
  AND e.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.enrollments
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.enrollments ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "enrollments: self read"  ON public.enrollments;
DROP POLICY IF EXISTS "enrollments: staff read" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments: self enroll" ON public.enrollments;
DROP POLICY IF EXISTS "Students can view their own enrollments"    ON public.enrollments;
DROP POLICY IF EXISTS "Teachers and admins can view all enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "students view own enrollments"              ON public.enrollments;
DROP POLICY IF EXISTS "staff view all enrollments"                 ON public.enrollments;
DROP POLICY IF EXISTS "staff manage all enrollments"               ON public.enrollments;

CREATE POLICY "enrollments: students read own"
  ON public.enrollments FOR SELECT
  TO authenticated
  USING (
    user_id = public.current_user_uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "enrollments: staff read own org"
  ON public.enrollments FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin', 'manager', 'teacher')
    )
  );

CREATE POLICY "enrollments: students enroll own org"
  ON public.enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = public.current_user_uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "enrollments: staff manage own org"
  ON public.enrollments FOR ALL
  TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  )
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  );

-- ─── COURSE_ENROLLMENTS ───────────────────────────────────────────────────────
-- The newer course_enrollments table (from canvas_block_model) — same fix

ALTER TABLE public.course_enrollments
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.course_enrollments ce
SET org_id = p.org_id
FROM public.profiles p
WHERE ce.user_id = p.uid
  AND ce.org_id IS NULL
  AND p.org_id IS NOT NULL;

UPDATE public.course_enrollments
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.course_enrollments ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "course_enrollments: self read"    ON public.course_enrollments;
DROP POLICY IF EXISTS "course_enrollments: staff read"   ON public.course_enrollments;
DROP POLICY IF EXISTS "course_enrollments: self enroll"  ON public.course_enrollments;
DROP POLICY IF EXISTS "course_enrollments: staff manage" ON public.course_enrollments;

CREATE POLICY "course_enrollments: students read own"
  ON public.course_enrollments FOR SELECT
  TO authenticated
  USING (
    user_id = public.current_user_uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "course_enrollments: staff read own org"
  ON public.course_enrollments FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin', 'manager', 'teacher')
    )
  );

CREATE POLICY "course_enrollments: enroll own org"
  ON public.course_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = public.current_user_uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "course_enrollments: staff manage own org"
  ON public.course_enrollments FOR ALL
  TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  )
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  );

-- actor_id is already nullable in platform_audit_log (defined that way in migration 20260618200000).
-- No ALTER needed here.
