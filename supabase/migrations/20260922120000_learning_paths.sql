-- COUNCIL-2026-029: Learning Paths / Discipleship Tracks
-- Adds learning_paths and learning_path_courses tables with RLS.

-- ============================================================
-- 1. learning_paths
-- ============================================================
CREATE TABLE public.learning_paths (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title           text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description     text,
  is_published    boolean     NOT NULL DEFAULT false,
  cover_image_url text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;

-- updated_at trigger — reuse the function that already exists in the codebase
CREATE TRIGGER handle_learning_paths_updated_at
  BEFORE UPDATE ON public.learning_paths
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_learning_paths_org_published
  ON public.learning_paths (org_id, is_published);

-- ============================================================
-- 2. learning_path_courses  (junction table)
-- ============================================================
CREATE TABLE public.learning_path_courses (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  path_id    uuid        NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  course_id  uuid        NOT NULL REFERENCES public.courses(id)        ON DELETE CASCADE,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (path_id, course_id)
);

ALTER TABLE public.learning_path_courses ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_learning_path_courses_path_order
  ON public.learning_path_courses (path_id, sort_order);

CREATE INDEX idx_learning_path_courses_course
  ON public.learning_path_courses (course_id);

-- ============================================================
-- 3. RLS policies — learning_paths
-- ============================================================

-- Members: read published paths in their org
CREATE POLICY "learning_paths: members read published"
  ON public.learning_paths FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND is_published = true
    )
  );

-- Admins/managers: read ALL paths in their org (including drafts)
CREATE POLICY "learning_paths: admin read all"
  ON public.learning_paths FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin', 'manager')
    )
  );

-- Admins/managers: create paths (must be in their own org)
CREATE POLICY "learning_paths: admin insert"
  ON public.learning_paths FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager')
  );

-- Admins/managers: update paths in their org
CREATE POLICY "learning_paths: admin update"
  ON public.learning_paths FOR UPDATE TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager')
  );

-- Admins/managers: delete paths in their org
CREATE POLICY "learning_paths: admin delete"
  ON public.learning_paths FOR DELETE TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager')
  );

-- ============================================================
-- 4. RLS policies — learning_path_courses
-- ============================================================

-- Members: read courses for any path they can see (via learning_paths)
CREATE POLICY "learning_path_courses: member read"
  ON public.learning_path_courses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_paths lp
      WHERE lp.id = path_id
        AND (
          public.is_platform_admin()
          OR public.current_user_org_id() = lp.org_id
        )
    )
  );

-- Admins/managers: insert course into a path they own
CREATE POLICY "learning_path_courses: admin insert"
  ON public.learning_path_courses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.learning_paths lp
      WHERE lp.id = path_id
        AND public.current_user_org_id() = lp.org_id
        AND public.current_user_role() IN ('admin', 'manager')
    )
  );

-- Admins/managers: update (reorder) courses in a path they own
CREATE POLICY "learning_path_courses: admin update"
  ON public.learning_path_courses FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_paths lp
      WHERE lp.id = path_id
        AND public.current_user_org_id() = lp.org_id
        AND public.current_user_role() IN ('admin', 'manager')
    )
  );

-- Admins/managers: remove courses from a path they own
CREATE POLICY "learning_path_courses: admin delete"
  ON public.learning_path_courses FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_paths lp
      WHERE lp.id = path_id
        AND public.current_user_org_id() = lp.org_id
        AND public.current_user_role() IN ('admin', 'manager')
    )
  );
