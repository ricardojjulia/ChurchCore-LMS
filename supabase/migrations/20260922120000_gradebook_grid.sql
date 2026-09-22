-- Migration: 20260922120000_gradebook_grid.sql
-- Council:   COUNCIL-2026-030 — Holistic Gradebook Grid
--
-- This migration addresses a real, pre-existing authorization gap:
-- "block_submissions: staff grade own org" (introduced in migration
-- 20260618200200_org_id_rls_isolation.sql) dropped the course-ownership check
-- that migration 20240601000027_learning_engine.sql originally enforced for
-- teachers. The result was that any teacher in an org could UPDATE any other
-- teacher's course submissions. This migration restores that check for the
-- 'teacher' role while leaving 'admin'/'manager' as org-wide (consistent
-- with how all other staff-level policies in the codebase are shaped).
--
-- It also adds:
--   • a matching INSERT policy needed by setGradeCell() when grading an
--     unsubmitted student (D6 — in-person assessment recorded after the fact)
--   • the get_course_gradebook_grid() RPC, modeled on get_gradebook_summary()
--   • idx_course_enrollments_roster for roster-filter query performance

-- ─── 1. Fix UPDATE policy: restore ownership check for teacher role ──────────
-- The policy is dropped and recreated, not ALTER-ed, so the intent is explicit
-- and the diff is unambiguous.

DROP POLICY IF EXISTS "block_submissions: staff grade own org" ON public.block_submissions;

CREATE POLICY "block_submissions: staff grade own org"
  ON public.block_submissions FOR UPDATE TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND (
      public.current_user_role() IN ('admin', 'manager')
      OR (
        public.current_user_role() = 'teacher'
        AND EXISTS (
          SELECT 1 FROM public.course_blocks cb
          JOIN public.courses c ON c.id = cb.course_id
          WHERE cb.id = block_submissions.block_id
            AND c.owner_id = public.current_user_uid()
        )
      )
    )
  )
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND (
      public.current_user_role() IN ('admin', 'manager')
      OR (
        public.current_user_role() = 'teacher'
        AND EXISTS (
          SELECT 1 FROM public.course_blocks cb
          JOIN public.courses c ON c.id = cb.course_id
          WHERE cb.id = block_submissions.block_id
            AND c.owner_id = public.current_user_uid()
        )
      )
    )
  );

-- ─── 2. INSERT policy for staff creating graded submissions (D6) ────────────
-- setGradeCell() can insert a new block_submissions row when grading an
-- unsubmitted student (in-person assessment recorded after the fact).
-- Same ownership shape as the UPDATE policy above: admin/manager are org-wide,
-- teacher must own the course that contains the block.

DROP POLICY IF EXISTS "block_submissions: staff create graded own org" ON public.block_submissions;

CREATE POLICY "block_submissions: staff create graded own org"
  ON public.block_submissions FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND (
      public.current_user_role() IN ('admin', 'manager')
      OR (
        public.current_user_role() = 'teacher'
        AND EXISTS (
          SELECT 1 FROM public.course_blocks cb
          JOIN public.courses c ON c.id = cb.course_id
          WHERE cb.id = block_submissions.block_id
            AND c.owner_id = public.current_user_uid()
        )
      )
    )
  );

-- ─── 3. RPC: get_course_gradebook_grid ───────────────────────────────────────
-- Returns one row per (active student enrollment × published assignment/quiz
-- block) for a course, LEFT JOINed against block_submissions so ungraded cells
-- appear as NULL rather than missing rows (D1, D2).
--
-- Auth shape mirrors get_gradebook_summary() (migration 20250710090200):
--   • staff role required (admin / manager / teacher)
--   • course must belong to the caller's org (tenant isolation)
--   • if role is 'teacher', the caller must own the course (D4)
--
-- SECURITY DEFINER so the query can join profiles without triggering
-- profile_roles-based RLS on profiles — the auth check is explicit above.

CREATE OR REPLACE FUNCTION public.get_course_gradebook_grid(p_course_id UUID)
RETURNS TABLE (
  enrollment_id  UUID,
  student_uid    UUID,
  student_name   TEXT,
  block_id       UUID,
  block_title    TEXT,
  sort_order     DOUBLE PRECISION,
  submission_id  UUID,
  score          NUMERIC,
  max_score      NUMERIC,
  grade_pct      NUMERIC,
  status         TEXT,
  feedback       TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_role   TEXT;
BEGIN
  -- Resolve caller identity via profile_roles (same pattern as get_gradebook_summary)
  SELECT caller.org_id, caller.role
    INTO v_org_id, v_role
  FROM private.get_caller_profile() caller
  LIMIT 1;

  -- Require staff role
  IF v_role NOT IN ('admin', 'manager', 'teacher') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Verify the course exists and belongs to the caller's org (tenant isolation)
  IF NOT EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = p_course_id
      AND c.org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Teacher must own the course; admin/manager have org-wide access
  IF v_role = 'teacher' AND NOT EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = p_course_id
      AND c.owner_id = public.current_user_uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    ce.id            AS enrollment_id,
    ce.user_id       AS student_uid,
    p.display_name   AS student_name,
    cb.id            AS block_id,
    cb.title         AS block_title,
    cb.sort_order,
    bs.id            AS submission_id,
    bs.score,
    bs.max_score,
    bs.grade_pct,
    bs.status        AS status,
    bs.feedback
  FROM public.course_enrollments ce
  JOIN public.profiles p ON p.uid = ce.user_id
  CROSS JOIN public.course_blocks cb
  LEFT JOIN public.block_submissions bs
    ON bs.block_id = cb.id
   AND bs.user_id  = ce.user_id
   AND NOT bs.is_deleted
  WHERE ce.course_id      = p_course_id
    AND ce.role::text     = 'student'
    AND ce.status::text   = 'active'
    AND cb.course_id      = p_course_id
    AND cb.block_type_id IN ('assignment', 'quiz')
    AND cb.is_published
  ORDER BY p.display_name, cb.sort_order;
END;
$$;

COMMENT ON FUNCTION public.get_course_gradebook_grid(UUID) IS
  'Returns one row per (active enrollment × published assignment/quiz block) for a course. '
  'Staff-only: admin/manager can access any course in their org; teacher must own the course. '
  'Mirrors get_gradebook_summary() auth shape. See COUNCIL-2026-030 for the full rationale, '
  'and COUNCIL-2026-030 Context for the pre-existing authorization gap this migration fixes.';

-- ─── 4. Index for roster filter performance ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_course_enrollments_roster
  ON public.course_enrollments (course_id, role, status);
