-- ============================================================
-- Migration: 20250710090200_reporting_materialized_views.sql
-- Description: Reporting materialized views and access functions
-- ADR: ADR-2025-012 Amendment 001
-- Author: ChurchCore LMS Engineering
-- Date: 2025-07-10
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_course_completion_rates AS
SELECT
  c.org_id,
  c.id AS course_id,
  c.title AS course_title,
  COUNT(e.id)::INTEGER AS enrolled_count,
  COUNT(e.id) FILTER (WHERE e.transit_status = 'completed')::INTEGER AS completed_count,
  CASE
    WHEN COUNT(e.id) = 0 THEN 0::NUMERIC(5,2)
    ELSE ROUND(
      (COUNT(e.id) FILTER (WHERE e.transit_status = 'completed')::NUMERIC / COUNT(e.id)::NUMERIC) * 100,
      2
    )
  END AS completion_rate_pct,
  NOW() AS refreshed_at
FROM public.courses c
LEFT JOIN public.enrollments e ON e.course_id = c.id
WHERE c.org_id IS NOT NULL
GROUP BY c.org_id, c.id, c.title;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_course_completion_rates_unique
  ON public.mv_course_completion_rates(org_id, course_id);

COMMENT ON MATERIALIZED VIEW public.mv_course_completion_rates IS
  'Reporting aggregate for course completion rates. Materialized views do not inherit RLS; access is enforced through SECURITY DEFINER functions.';

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_gradebook_summary AS
SELECT
  c.org_id,
  c.id AS course_id,
  p.uid AS user_id,
  p.display_name AS student_name,
  COUNT(bs.id)::INTEGER AS total_submissions,
  ROUND(AVG(bs.grade_pct) FILTER (WHERE bs.grade_pct IS NOT NULL), 2) AS avg_grade,
  MAX(bs.submitted_at) AS last_submission_at
FROM public.enrollments e
JOIN public.courses c ON c.id = e.course_id
JOIN public.profiles p ON p.uid = e.user_id
LEFT JOIN public.course_blocks cb
  ON cb.course_id = c.id
 AND cb.block_type_id IN ('assignment', 'quiz')
 AND cb.is_published = TRUE
LEFT JOIN public.block_submissions bs
  ON bs.block_id = cb.id
 AND bs.user_id = e.user_id
 AND NOT COALESCE(bs.is_deleted, FALSE)
WHERE c.org_id IS NOT NULL
GROUP BY c.org_id, c.id, p.uid, p.display_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_gradebook_summary_unique
  ON public.mv_gradebook_summary(org_id, course_id, user_id);

COMMENT ON MATERIALIZED VIEW public.mv_gradebook_summary IS
  'Reporting aggregate for gradebook summaries. Materialized views do not inherit RLS; access is enforced through SECURITY DEFINER functions.';

CREATE OR REPLACE FUNCTION public.get_course_completion_rates(p_org_id UUID)
RETURNS TABLE (
  org_id UUID,
  course_id UUID,
  course_title TEXT,
  enrolled_count INTEGER,
  completed_count INTEGER,
  completion_rate_pct NUMERIC,
  refreshed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_role TEXT;
BEGIN
  SELECT caller.org_id, caller.role
    INTO v_org_id, v_role
  FROM private.get_caller_profile() caller
  LIMIT 1;

  IF v_org_id IS NULL OR v_org_id IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_role NOT IN ('admin', 'teacher', 'instructor') THEN
    RAISE EXCEPTION 'Insufficient role';
  END IF;

  RETURN QUERY
  SELECT
    mv.org_id,
    mv.course_id,
    mv.course_title,
    mv.enrolled_count,
    mv.completed_count,
    mv.completion_rate_pct,
    mv.refreshed_at
  FROM public.mv_course_completion_rates mv
  WHERE mv.org_id = p_org_id
  ORDER BY mv.course_title;
END;
$$;

COMMENT ON FUNCTION public.get_course_completion_rates(UUID) IS
  'Role-scoped access function for mv_course_completion_rates; validates organization and staff role before returning rows.';

CREATE OR REPLACE FUNCTION public.get_gradebook_summary(p_org_id UUID, p_course_id UUID)
RETURNS TABLE (
  org_id UUID,
  course_id UUID,
  user_id UUID,
  student_name TEXT,
  total_submissions INTEGER,
  avg_grade NUMERIC,
  last_submission_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_role TEXT;
BEGIN
  SELECT caller.org_id, caller.role
    INTO v_org_id, v_role
  FROM private.get_caller_profile() caller
  LIMIT 1;

  IF v_org_id IS NULL OR v_org_id IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_role NOT IN ('admin', 'teacher', 'instructor') THEN
    RAISE EXCEPTION 'Insufficient role';
  END IF;

  IF v_role <> 'admin' AND NOT EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = p_course_id
      AND c.org_id = p_org_id
      AND c.owner_id = public.current_user_uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    mv.org_id,
    mv.course_id,
    mv.user_id,
    mv.student_name,
    mv.total_submissions,
    mv.avg_grade,
    mv.last_submission_at
  FROM public.mv_gradebook_summary mv
  WHERE mv.org_id = p_org_id
    AND mv.course_id = p_course_id
  ORDER BY mv.student_name;
END;
$$;

COMMENT ON FUNCTION public.get_gradebook_summary(UUID, UUID) IS
  'Role-scoped access function for mv_gradebook_summary; admins can read organization courses, teachers only their owned course.';

CREATE OR REPLACE FUNCTION public.refresh_report_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_course_completion_rates;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_gradebook_summary;
END;
$$;

COMMENT ON FUNCTION public.refresh_report_materialized_views() IS
  'Refreshes reporting materialized views; called by hourly cron and daily lifecycle manager.';
