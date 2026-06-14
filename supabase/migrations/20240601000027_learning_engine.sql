-- ═══════════════════════════════════════════════════════════════════════
-- Migration 027: Learning Engine — block_submissions RLS, MV fix, grading
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Fix block_submissions ──────────────────────────────────────────
-- graded_by was auth.users; remap to profiles.uid (like user_id already is)
DO $$ BEGIN
  ALTER TABLE public.block_submissions
    DROP CONSTRAINT IF EXISTS block_submissions_graded_by_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Update graded_by to profiles.uid (safe no-op if already done)
UPDATE public.block_submissions bs
SET graded_by = p.uid
FROM public.profiles p
WHERE p.auth_id = bs.graded_by
  AND bs.graded_by IS NOT NULL;

ALTER TABLE public.block_submissions
  ADD CONSTRAINT block_submissions_graded_by_fkey
  FOREIGN KEY (graded_by) REFERENCES public.profiles(uid);

-- Add grade_pct as computed column (score / max_score * 100)
ALTER TABLE public.block_submissions
  ADD COLUMN IF NOT EXISTS grade_pct NUMERIC(5, 2)
  GENERATED ALWAYS AS (
    CASE WHEN max_score IS NOT NULL AND max_score > 0
         THEN ROUND((score / max_score) * 100, 2)
         ELSE NULL
    END
  ) STORED;

-- Add is_deleted for soft-delete (consistent with messages)
ALTER TABLE public.block_submissions
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. Fix block_submissions RLS ──────────────────────────────────────
-- Drop all old policies (they reference auth.uid() which is now wrong)
DROP POLICY IF EXISTS "students manage their submissions"      ON public.block_submissions;
DROP POLICY IF EXISTS "staff view all submissions"             ON public.block_submissions;
DROP POLICY IF EXISTS "block_submissions: students view own"   ON public.block_submissions;
DROP POLICY IF EXISTS "block_submissions: staff view all"      ON public.block_submissions;
DROP POLICY IF EXISTS "block_submissions: students submit"     ON public.block_submissions;
DROP POLICY IF EXISTS "block_submissions: staff grade"         ON public.block_submissions;

-- Re-create with current_user_uid() helpers
CREATE POLICY "block_submissions: students view own"
  ON public.block_submissions FOR SELECT
  USING (user_id = current_user_uid() AND NOT is_deleted);

CREATE POLICY "block_submissions: staff view course subs"
  ON public.block_submissions FOR SELECT
  USING (
    current_user_role() IN ('admin', 'manager', 'teacher')
    AND EXISTS (
      SELECT 1 FROM public.course_blocks cb
      JOIN public.courses c ON c.id = cb.course_id
      WHERE cb.id = block_submissions.block_id
        AND (c.owner_id = current_user_uid() OR current_user_role() IN ('admin', 'manager'))
    )
    AND NOT is_deleted
  );

CREATE POLICY "block_submissions: students submit"
  ON public.block_submissions FOR INSERT
  WITH CHECK (user_id = current_user_uid());

CREATE POLICY "block_submissions: students update own draft"
  ON public.block_submissions FOR UPDATE
  USING (user_id = current_user_uid() AND status = 'draft');

CREATE POLICY "block_submissions: staff grade"
  ON public.block_submissions FOR UPDATE
  USING (
    current_user_role() IN ('admin', 'teacher')
    AND EXISTS (
      SELECT 1 FROM public.course_blocks cb
      JOIN public.courses c ON c.id = cb.course_id
      WHERE cb.id = block_submissions.block_id
        AND (c.owner_id = current_user_uid() OR current_user_role() IN ('admin', 'manager'))
    )
  );

-- ── 3. Replace mv_academic_performance to use block_submissions ────────
-- Drop dependent functions first, then the MV
DROP FUNCTION IF EXISTS public.get_my_academic_performance();
DROP FUNCTION IF EXISTS public.get_course_performance(UUID);
DROP FUNCTION IF EXISTS public.get_my_overall_gpa();
DROP MATERIALIZED VIEW IF EXISTS public.mv_academic_performance;

CREATE MATERIALIZED VIEW public.mv_academic_performance AS
SELECT
  e.user_id,
  e.course_id,
  c.title                                                          AS course_title,
  c.owner_id                                                       AS instructor_id,
  e.transit_status                                                 AS enrollment_status,
  e.progress_percent,
  e.enrolled_at,
  e.last_accessed_at,

  -- Submission counts (from block_submissions via course_blocks)
  COUNT(bs.id)                                                     AS total_submissions,
  COUNT(bs.id) FILTER (WHERE bs.grade_pct IS NOT NULL)             AS graded_submissions,

  -- Grade aggregates
  ROUND(AVG(bs.grade_pct) FILTER (WHERE bs.grade_pct IS NOT NULL), 2) AS average_grade,
  MAX(bs.grade_pct)                                                AS highest_grade,
  MIN(bs.grade_pct) FILTER (WHERE bs.grade_pct IS NOT NULL)        AS lowest_grade,

  -- XP earned
  COALESCE(SUM(
    CASE WHEN bs.status = 'graded' AND bs.score IS NOT NULL
         THEN COALESCE((cb.gamification->>'base_xp_reward')::int, 0)
         ELSE 0
    END
  ), 0)                                                            AS total_xp_earned,

  -- GPA (0–4.0 scale)
  CASE
    WHEN AVG(bs.grade_pct) IS NULL    THEN NULL
    WHEN AVG(bs.grade_pct) >= 93      THEN 4.0
    WHEN AVG(bs.grade_pct) >= 90      THEN 3.7
    WHEN AVG(bs.grade_pct) >= 87      THEN 3.3
    WHEN AVG(bs.grade_pct) >= 83      THEN 3.0
    WHEN AVG(bs.grade_pct) >= 80      THEN 2.7
    WHEN AVG(bs.grade_pct) >= 77      THEN 2.3
    WHEN AVG(bs.grade_pct) >= 73      THEN 2.0
    WHEN AVG(bs.grade_pct) >= 70      THEN 1.7
    WHEN AVG(bs.grade_pct) >= 67      THEN 1.3
    WHEN AVG(bs.grade_pct) >= 60      THEN 1.0
    ELSE 0.0
  END                                                              AS gpa_points,

  -- Letter grade
  CASE
    WHEN AVG(bs.grade_pct) IS NULL    THEN 'N/A'
    WHEN AVG(bs.grade_pct) >= 93      THEN 'A'
    WHEN AVG(bs.grade_pct) >= 90      THEN 'A-'
    WHEN AVG(bs.grade_pct) >= 87      THEN 'B+'
    WHEN AVG(bs.grade_pct) >= 83      THEN 'B'
    WHEN AVG(bs.grade_pct) >= 80      THEN 'B-'
    WHEN AVG(bs.grade_pct) >= 77      THEN 'C+'
    WHEN AVG(bs.grade_pct) >= 73      THEN 'C'
    WHEN AVG(bs.grade_pct) >= 70      THEN 'C-'
    WHEN AVG(bs.grade_pct) >= 67      THEN 'D+'
    WHEN AVG(bs.grade_pct) >= 60      THEN 'D'
    ELSE 'F'
  END                                                              AS letter_grade,

  -- At-risk: failing OR no activity in 7d while in progress OR never started in 14d
  (
    (AVG(bs.grade_pct) IS NOT NULL AND AVG(bs.grade_pct) < 70)
    OR (
      e.last_accessed_at IS NOT NULL
      AND e.last_accessed_at < NOW() - INTERVAL '7 days'
      AND e.transit_status = 'in_progress'
    )
    OR (
      e.last_accessed_at IS NULL
      AND e.enrolled_at < NOW() - INTERVAL '14 days'
      AND e.transit_status = 'not_started'
    )
  )                                                                AS is_at_risk,

  NOW()                                                            AS computed_at

FROM public.enrollments e
JOIN public.courses c ON c.id = e.course_id
LEFT JOIN public.course_blocks cb
  ON cb.course_id = e.course_id
 AND cb.block_type_id IN ('assignment', 'quiz')
 AND cb.is_published = TRUE
LEFT JOIN public.block_submissions bs
  ON bs.block_id = cb.id
 AND bs.user_id  = e.user_id
 AND NOT bs.is_deleted

GROUP BY
  e.user_id, e.course_id, c.title, c.owner_id,
  e.transit_status, e.progress_percent,
  e.enrolled_at, e.last_accessed_at;

CREATE UNIQUE INDEX idx_mv_academic_perf_pk
  ON public.mv_academic_performance(user_id, course_id);

CREATE INDEX idx_mv_academic_perf_instructor
  ON public.mv_academic_performance(instructor_id);

CREATE INDEX idx_mv_academic_perf_at_risk
  ON public.mv_academic_performance(instructor_id, is_at_risk)
  WHERE is_at_risk = TRUE;

-- ── 4. Security-definer functions (recreate after MV drop) ────────────
CREATE OR REPLACE FUNCTION public.get_my_academic_performance()
RETURNS SETOF public.mv_academic_performance
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.mv_academic_performance
  WHERE user_id = current_user_uid()
  ORDER BY course_title;
$$;

CREATE OR REPLACE FUNCTION public.get_course_performance(p_course_id UUID)
RETURNS SETOF public.mv_academic_performance
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ap.*
  FROM public.mv_academic_performance ap
  WHERE ap.course_id = p_course_id
    AND (
      ap.instructor_id = current_user_uid()
      OR current_user_role() IN ('admin', 'manager')
    )
  ORDER BY ap.average_grade DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.get_my_overall_gpa()
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ROUND(AVG(gpa_points), 2)
  FROM public.mv_academic_performance
  WHERE user_id    = current_user_uid()
    AND gpa_points IS NOT NULL;
$$;

-- ── 5. Grading query function for instructors ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_course_submissions(p_course_id UUID)
RETURNS TABLE (
  submission_id   UUID,
  block_id        UUID,
  block_title     TEXT,
  block_type      TEXT,
  student_uid     UUID,
  student_name    TEXT,
  student_email   TEXT,
  status          TEXT,
  content         JSONB,
  score           NUMERIC,
  max_score       NUMERIC,
  grade_pct       NUMERIC,
  feedback        TEXT,
  submitted_at    TIMESTAMPTZ,
  graded_at       TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    bs.id             AS submission_id,
    bs.block_id,
    cb.title          AS block_title,
    cb.block_type_id  AS block_type,
    bs.user_id        AS student_uid,
    p.display_name    AS student_name,
    p.email           AS student_email,
    bs.status,
    bs.content,
    bs.score,
    bs.max_score,
    bs.grade_pct,
    bs.feedback,
    bs.submitted_at,
    bs.graded_at
  FROM public.block_submissions bs
  JOIN public.course_blocks cb ON cb.id = bs.block_id
  JOIN public.profiles p       ON p.uid = bs.user_id
  JOIN public.courses c        ON c.id  = cb.course_id
  WHERE cb.course_id = p_course_id
    AND NOT bs.is_deleted
    AND (
      c.owner_id = current_user_uid()
      OR current_user_role() IN ('admin', 'manager')
    )
  ORDER BY bs.submitted_at DESC;
$$;

-- ── 6. Refresh triggers (updated to point at new MV) ─────────────────
DROP TRIGGER IF EXISTS trg_refresh_perf_on_grade       ON public.submissions;
DROP TRIGGER IF EXISTS trg_refresh_perf_on_enrollment  ON public.enrollments;

-- Replace with block_submissions trigger
CREATE OR REPLACE FUNCTION public.refresh_academic_performance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_academic_performance;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_refresh_perf_on_block_sub
  AFTER INSERT OR UPDATE OF score, status ON public.block_submissions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_academic_performance();

CREATE TRIGGER trg_refresh_perf_on_enrollment
  AFTER INSERT OR UPDATE OF transit_status, progress_percent, last_accessed_at
  ON public.enrollments
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_academic_performance();

-- ── 7. Initial populate ───────────────────────────────────────────────
REFRESH MATERIALIZED VIEW public.mv_academic_performance;
