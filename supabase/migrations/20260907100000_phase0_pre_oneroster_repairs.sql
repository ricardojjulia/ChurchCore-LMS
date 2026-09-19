-- Phase 0 repairs before OneRoster work.
-- Keeps existing security boundaries while fixing live DB lint/function drift.

-- ── get_block_discussion_replies: qualify column references ──────────────────
CREATE OR REPLACE FUNCTION public.get_block_discussion_replies(p_block_id UUID)
RETURNS TABLE (
  submission_id  UUID,
  user_id        UUID,
  display_name   TEXT,
  content        JSONB,
  submitted_at   TIMESTAMPTZ,
  is_own         BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_course_id UUID;
  v_uid       UUID := public.current_user_uid();
  v_role      TEXT := public.current_user_role();
BEGIN
  SELECT cb.course_id
    INTO v_course_id
    FROM public.course_blocks cb
   WHERE cb.id = p_block_id
     AND cb.block_type_id = 'discussion';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block not found or not a discussion block';
  END IF;

  IF v_role NOT IN ('admin', 'manager', 'teacher') THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.enrollments e
       WHERE e.user_id = v_uid
         AND e.course_id = v_course_id
    ) THEN
      RAISE EXCEPTION 'Not enrolled in this course';
    END IF;
  END IF;

  RETURN QUERY
    SELECT
      bs.id AS submission_id,
      bs.user_id AS user_id,
      p.display_name AS display_name,
      bs.content AS content,
      bs.submitted_at AS submitted_at,
      (bs.user_id = v_uid) AS is_own
    FROM public.block_submissions bs
    JOIN public.profiles p ON p.uid = bs.user_id
   WHERE bs.block_id = p_block_id
     AND bs.is_deleted = FALSE
   ORDER BY bs.submitted_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_block_discussion_replies(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_block_discussion_replies(UUID) FROM anon;

-- ── Guardian functions: profiles.xp was renamed to profiles.xp_points ───────
CREATE OR REPLACE FUNCTION public.get_guardian_students()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid    UUID;
  v_result JSON;
BEGIN
  SELECT pr.uid
    INTO v_uid
    FROM public.profile_roles pr
   WHERE pr.auth_id = auth.uid()
   LIMIT 1;

  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;

  SELECT json_agg(json_build_object(
    'student_uid',      p.uid,
    'display_name',     p.display_name,
    'student_id',       p.student_id,
    'current_level',    p.current_level,
    'xp',               p.xp_points,
    'enrollment_count', (
      SELECT COUNT(*)::INT FROM public.enrollments e WHERE e.user_id = p.uid
    ),
    'completed_count',  (
      SELECT COUNT(*)::INT FROM public.enrollments e
      WHERE e.user_id = p.uid AND e.transit_status = 'completed'
    ),
    'linked_at',        gl.created_at
  ) ORDER BY p.display_name)
  INTO v_result
  FROM public.guardian_links gl
  JOIN public.profiles p ON p.uid = gl.student_uid
  WHERE gl.guardian_uid = v_uid;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_guardian_students() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_guardian_students() FROM anon;

CREATE OR REPLACE FUNCTION public.get_guardian_student_overview(p_student_uid UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_guardian_uid UUID;
  v_result       JSON;
BEGIN
  SELECT pr.uid
    INTO v_guardian_uid
    FROM public.profile_roles pr
   WHERE pr.auth_id = auth.uid()
   LIMIT 1;

  IF v_guardian_uid IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.guardian_links gl
     WHERE gl.guardian_uid = v_guardian_uid
       AND gl.student_uid = p_student_uid
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this student';
  END IF;

  SELECT json_build_object(
    'profile', (
      SELECT json_build_object(
        'uid',           p.uid,
        'display_name',  p.display_name,
        'student_id',    p.student_id,
        'current_level', p.current_level,
        'xp',            p.xp_points
      ) FROM public.profiles p WHERE p.uid = p_student_uid
    ),
    'enrollments', (
      SELECT COALESCE(json_agg(json_build_object(
        'course_id',        e.course_id,
        'course_title',     c.title,
        'status',           e.transit_status,
        'progress_percent', e.progress_percent,
        'enrolled_at',      e.enrolled_at
      ) ORDER BY e.enrolled_at DESC), '[]'::JSON)
      FROM public.enrollments e
      JOIN public.courses c ON c.id = e.course_id
      WHERE e.user_id = p_student_uid
    ),
    'recent_grades', (
      SELECT COALESCE(json_agg(json_build_object(
        'block_title',  cb.title,
        'course_title', c.title,
        'score',        bs.score,
        'max_score',    bs.max_score,
        'grade_pct',    bs.grade_pct,
        'graded_at',    bs.graded_at
      ) ORDER BY bs.graded_at DESC NULLS LAST), '[]'::JSON)
      FROM (
        SELECT bsub.*
          FROM public.block_submissions bsub
         WHERE bsub.user_id = p_student_uid
           AND bsub.status = 'graded'
         ORDER BY bsub.graded_at DESC NULLS LAST
         LIMIT 10
      ) bs
      JOIN public.course_blocks cb ON cb.id = bs.block_id
      JOIN public.courses c ON c.id = cb.course_id
    ),
    'certificates', (
      SELECT COALESCE(json_agg(json_build_object(
        'course_title',       c.title,
        'certificate_number', cc.certificate_number,
        'issued_at',          cc.issued_at,
        'grade_pct',          cc.grade_pct
      ) ORDER BY cc.issued_at DESC), '[]'::JSON)
      FROM public.course_certificates cc
      JOIN public.courses c ON c.id = cc.course_id
      WHERE cc.user_id = p_student_uid
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_guardian_student_overview(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_guardian_student_overview(UUID) FROM anon;

-- ── record_engagement_event: ROW_COUNT must be captured as integer ───────────
CREATE OR REPLACE FUNCTION public.record_engagement_event(
  p_event_type  TEXT,
  p_source_type TEXT    DEFAULT NULL,
  p_source_id   UUID    DEFAULT NULL,
  p_xp          INTEGER DEFAULT 0,
  p_metadata    JSONB   DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid           UUID;
  v_org_id        UUID;
  v_row_count     INTEGER := 0;
  v_inserted      BOOLEAN := FALSE;
  v_new_streak    INTEGER := 0;
  v_longest       INTEGER := 0;
  v_xp_result     JSON;
  v_new_xp        INTEGER := 0;
  v_new_level     INTEGER := 1;
  v_leveled_up    BOOLEAN := FALSE;
BEGIN
  SELECT pr.uid, pr.org_id
    INTO v_uid, v_org_id
    FROM public.profile_roles pr
   WHERE pr.auth_id = auth.uid()
   LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN json_build_object('error', 'Profile not found');
  END IF;

  IF p_event_type NOT IN ('block_completion','quiz_pass','discussion_post','daily_login','course_completion','manual') THEN
    RETURN json_build_object('error', 'Invalid event type');
  END IF;

  INSERT INTO public.engagement_events
    (user_id, org_id, event_type, source_type, source_id, xp_earned, metadata)
  VALUES
    (v_uid, v_org_id, p_event_type, p_source_type, p_source_id,
     COALESCE(p_xp, 0), COALESCE(p_metadata, '{}'::JSONB))
  ON CONFLICT (user_id, source_type, source_id, event_type)
    WHERE source_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_inserted := (v_row_count > 0);

  IF v_inserted AND p_xp > 0 THEN
    SELECT public.award_xp(v_uid, p_xp) INTO v_xp_result;
    v_new_xp := COALESCE((v_xp_result->>'new_xp')::INTEGER, 0);
    v_new_level := COALESCE((v_xp_result->>'new_level')::INTEGER, 1);
    v_leveled_up := COALESCE((v_xp_result->>'leveled_up')::BOOLEAN, FALSE);
  ELSE
    SELECT COALESCE(p.xp_points, 0), COALESCE(p.current_level, 1)
      INTO v_new_xp, v_new_level
      FROM public.profiles p
     WHERE p.uid = v_uid;
  END IF;

  INSERT INTO public.engagement_streaks (user_id, org_id, current_streak, longest_streak, last_event_date)
  VALUES (v_uid, v_org_id, 1, 1, CURRENT_DATE)
  ON CONFLICT (user_id, org_id) DO UPDATE SET
    current_streak = CASE
      WHEN engagement_streaks.last_event_date = CURRENT_DATE - 1 THEN engagement_streaks.current_streak + 1
      WHEN engagement_streaks.last_event_date = CURRENT_DATE THEN engagement_streaks.current_streak
      ELSE 1
    END,
    longest_streak = GREATEST(
      engagement_streaks.longest_streak,
      CASE
        WHEN engagement_streaks.last_event_date = CURRENT_DATE - 1 THEN engagement_streaks.current_streak + 1
        WHEN engagement_streaks.last_event_date = CURRENT_DATE THEN engagement_streaks.current_streak
        ELSE 1
      END
    ),
    last_event_date = CURRENT_DATE,
    updated_at = NOW()
  RETURNING current_streak, longest_streak
    INTO v_new_streak, v_longest;

  IF v_new_streak IS NULL THEN
    SELECT es.current_streak, es.longest_streak
      INTO v_new_streak, v_longest
      FROM public.engagement_streaks es
     WHERE es.user_id = v_uid
       AND es.org_id = v_org_id;
  END IF;

  IF v_org_id IS NOT NULL THEN
    PERFORM public.evaluate_badge_triggers(v_uid, v_org_id, p_event_type);
  END IF;

  RETURN json_build_object(
    'inserted',        v_inserted,
    'xp_earned',       CASE WHEN v_inserted THEN COALESCE(p_xp, 0) ELSE 0 END,
    'new_xp',          v_new_xp,
    'new_level',       v_new_level,
    'leveled_up',      v_leveled_up,
    'current_streak',  COALESCE(v_new_streak, 0),
    'longest_streak',  COALESCE(v_longest, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_engagement_event(TEXT, TEXT, UUID, INTEGER, JSONB) TO authenticated;

-- ── resolve_term_config: explicit JSONB fallback and empty-chain guard ───────
CREATE OR REPLACE FUNCTION public.resolve_term_config(p_term_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_ancestors UUID[] := '{}';
  v_term_id   UUID := p_term_id;
  v_result    JSONB := '{}'::JSONB;
  v_config    JSONB;
  i           INTEGER;
BEGIN
  WHILE v_term_id IS NOT NULL LOOP
    v_ancestors := v_ancestors || v_term_id;
    SELECT at.parent_term_id
      INTO v_term_id
      FROM public.academic_terms at
     WHERE at.id = v_term_id;
  END LOOP;

  IF array_length(v_ancestors, 1) IS NULL THEN
    RETURN v_result;
  END IF;

  FOR i IN REVERSE array_length(v_ancestors, 1)..1 LOOP
    SELECT at.config
      INTO v_config
      FROM public.academic_terms at
     WHERE at.id = v_ancestors[i];
    v_result := v_result || COALESCE(v_config, '{}'::JSONB);
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_term_config(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.resolve_term_config(UUID) TO authenticated;
