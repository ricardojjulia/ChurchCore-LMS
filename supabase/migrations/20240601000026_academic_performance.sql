-- ═══════════════════════════════════════════════════════════════════════
-- Migration 026: Academic Performance Materialized View
-- All FKs reference profiles.uid (confirmed remapped in migration 005)
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Materialized view ──────────────────────────────────────────────

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

  -- Submission counts
  COUNT(s.id)                                                      AS total_submissions,
  COUNT(s.id) FILTER (WHERE s.grade_pct IS NOT NULL)               AS graded_submissions,

  -- Grade aggregates
  ROUND(AVG(s.grade_pct)  FILTER (WHERE s.grade_pct IS NOT NULL), 2) AS average_grade,
  MAX(s.grade_pct)                                                 AS highest_grade,
  MIN(s.grade_pct) FILTER (WHERE s.grade_pct IS NOT NULL)          AS lowest_grade,

  -- XP earned in this course
  COALESCE(SUM(s.xp_awarded), 0)                                   AS total_xp_earned,

  -- GPA equivalent (0–4.0 scale)
  CASE
    WHEN AVG(s.grade_pct) IS NULL    THEN NULL
    WHEN AVG(s.grade_pct) >= 93      THEN 4.0
    WHEN AVG(s.grade_pct) >= 90      THEN 3.7
    WHEN AVG(s.grade_pct) >= 87      THEN 3.3
    WHEN AVG(s.grade_pct) >= 83      THEN 3.0
    WHEN AVG(s.grade_pct) >= 80      THEN 2.7
    WHEN AVG(s.grade_pct) >= 77      THEN 2.3
    WHEN AVG(s.grade_pct) >= 73      THEN 2.0
    WHEN AVG(s.grade_pct) >= 70      THEN 1.7
    WHEN AVG(s.grade_pct) >= 67      THEN 1.3
    WHEN AVG(s.grade_pct) >= 60      THEN 1.0
    ELSE 0.0
  END                                                              AS gpa_points,

  -- Letter grade
  CASE
    WHEN AVG(s.grade_pct) IS NULL    THEN 'N/A'
    WHEN AVG(s.grade_pct) >= 93      THEN 'A'
    WHEN AVG(s.grade_pct) >= 90      THEN 'A-'
    WHEN AVG(s.grade_pct) >= 87      THEN 'B+'
    WHEN AVG(s.grade_pct) >= 83      THEN 'B'
    WHEN AVG(s.grade_pct) >= 80      THEN 'B-'
    WHEN AVG(s.grade_pct) >= 77      THEN 'C+'
    WHEN AVG(s.grade_pct) >= 73      THEN 'C'
    WHEN AVG(s.grade_pct) >= 70      THEN 'C-'
    WHEN AVG(s.grade_pct) >= 67      THEN 'D+'
    WHEN AVG(s.grade_pct) >= 60      THEN 'D'
    ELSE 'F'
  END                                                              AS letter_grade,

  -- At-risk flag (grade failing OR no activity in 7d with submissions pending)
  (
    (AVG(s.grade_pct) IS NOT NULL AND AVG(s.grade_pct) < 70)
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
LEFT JOIN public.submissions s
  ON s.student_id = e.user_id
 AND s.course_id  = e.course_id

GROUP BY
  e.user_id, e.course_id, c.title, c.owner_id,
  e.transit_status, e.progress_percent,
  e.enrolled_at, e.last_accessed_at;

-- Unique index (required for CONCURRENTLY refresh)
CREATE UNIQUE INDEX idx_mv_academic_perf_pk
  ON public.mv_academic_performance(user_id, course_id);

-- Instructor lookup index
CREATE INDEX idx_mv_academic_perf_instructor
  ON public.mv_academic_performance(instructor_id);

CREATE INDEX idx_mv_academic_perf_at_risk
  ON public.mv_academic_performance(instructor_id, is_at_risk)
  WHERE is_at_risk = TRUE;

-- ── 2. Security-definer query functions ───────────────────────────────
-- Views don't support RLS. These functions restore the auth.uid() boundary.

-- Students: own performance only
CREATE OR REPLACE FUNCTION public.get_my_academic_performance()
RETURNS SETOF public.mv_academic_performance
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.mv_academic_performance
  WHERE user_id = current_user_uid()
  ORDER BY course_title;
$$;

-- Instructors: see their own courses' students
CREATE OR REPLACE FUNCTION public.get_course_performance(p_course_id UUID)
RETURNS SETOF public.mv_academic_performance
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ap.*
  FROM public.mv_academic_performance ap
  WHERE ap.course_id = p_course_id
    AND (
      -- Course instructor
      ap.instructor_id = current_user_uid()
      -- OR admin/manager
      OR current_user_role() IN ('admin', 'manager')
    )
  ORDER BY ap.average_grade DESC NULLS LAST;
$$;

-- Overall GPA for current user (across all courses with grades)
CREATE OR REPLACE FUNCTION public.get_my_overall_gpa()
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ROUND(AVG(gpa_points), 2)
  FROM public.mv_academic_performance
  WHERE user_id    = current_user_uid()
    AND gpa_points IS NOT NULL;
$$;

-- ── 3. Refresh trigger on submissions ────────────────────────────────
-- Refresh concurrently so it never locks reads.
-- Note: CONCURRENTLY cannot run inside a transaction, so we use
-- a deferred approach via pg_background or just a plain refresh here.
-- For hosted Supabase (no pg_background), we do a direct refresh.

CREATE OR REPLACE FUNCTION public.refresh_academic_performance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_academic_performance;
  RETURN NULL;
END;
$$;

-- Fire after any grade change (grade_pct column updated)
CREATE TRIGGER trg_refresh_perf_on_grade
  AFTER INSERT OR UPDATE OF grade_pct ON public.submissions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_academic_performance();

-- Also refresh when enrollment transit_status or progress changes
CREATE TRIGGER trg_refresh_perf_on_enrollment
  AFTER INSERT OR UPDATE OF transit_status, progress_percent, last_accessed_at
  ON public.enrollments
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_academic_performance();

-- ── 4. Initial population ─────────────────────────────────────────────
REFRESH MATERIALIZED VIEW public.mv_academic_performance;
