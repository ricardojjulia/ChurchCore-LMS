-- Follow-up live lint repairs from Phase 0.

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
        'certificate_number', cc.certificate_no,
        'issued_at',          cc.issued_at,
        'grade_pct',          cc.final_grade
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

CREATE OR REPLACE FUNCTION public.resolve_term_config(p_term_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_ancestors UUID[] := ARRAY[]::UUID[];
  v_term_id   UUID := p_term_id;
  v_result    JSONB := '{}'::JSONB;
  v_config    JSONB;
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

  FOR v_index IN REVERSE array_length(v_ancestors, 1)..1 LOOP
    SELECT at.config
      INTO v_config
      FROM public.academic_terms at
     WHERE at.id = v_ancestors[v_index];
    v_result := v_result || COALESCE(v_config, '{}'::JSONB);
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_term_config(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.resolve_term_config(UUID) TO authenticated;
