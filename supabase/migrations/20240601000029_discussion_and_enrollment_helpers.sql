-- Migration 029: Discussion reply reader + bulk enrollment helper

-- ── get_block_discussion_replies ─────────────────────────────────────────────
-- Allows any enrolled student (or staff) to read all replies for a discussion
-- block. Uses SECURITY DEFINER to bypass the student's own-row policy.
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
  v_uid       UUID := current_user_uid();
  v_role      TEXT := current_user_role();
BEGIN
  -- Resolve the course this block belongs to
  SELECT cb.course_id INTO v_course_id
    FROM public.course_blocks cb
   WHERE cb.id = p_block_id
     AND cb.block_type_id = 'discussion';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block not found or not a discussion block';
  END IF;

  -- Access check: must be enrolled OR be staff
  IF v_role NOT IN ('admin', 'manager', 'teacher') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.enrollments
       WHERE user_id   = v_uid
         AND course_id = v_course_id
    ) THEN
      RAISE EXCEPTION 'Not enrolled in this course';
    END IF;
  END IF;

  RETURN QUERY
    SELECT
      bs.id            AS submission_id,
      bs.user_id,
      p.display_name,
      bs.content,
      bs.submitted_at,
      (bs.user_id = v_uid) AS is_own
    FROM public.block_submissions bs
    JOIN public.profiles p ON p.uid = bs.user_id
   WHERE bs.block_id   = p_block_id
     AND bs.is_deleted = FALSE
   ORDER BY bs.submitted_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_block_discussion_replies(UUID) TO authenticated;

-- ── staff_enroll_student: staff-only bulk enrollment ─────────────────────────
CREATE OR REPLACE FUNCTION public.staff_enroll_student(
  p_course_id UUID,
  p_uid       UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_role TEXT := current_user_role();
BEGIN
  IF v_role NOT IN ('admin', 'manager', 'teacher') THEN
    RAISE EXCEPTION 'Only staff can enroll students';
  END IF;

  -- Teachers can only enroll into their own courses
  IF v_role = 'teacher' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.courses
       WHERE id = p_course_id AND owner_id = current_user_uid()
    ) THEN
      RAISE EXCEPTION 'You can only enroll students in your own courses';
    END IF;
  END IF;

  INSERT INTO public.enrollments (user_id, course_id, transit_status, progress_percent)
  VALUES (p_uid, p_course_id, 'not_started', 0)
  ON CONFLICT (user_id, course_id) DO NOTHING;

  -- Notify the student
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    p_uid,
    'course_enrollment',
    'You have been enrolled in a course',
    (SELECT 'You''ve been enrolled in "' || title || '".' FROM public.courses WHERE id = p_course_id),
    '/courses/' || p_course_id || '/learn'
  )
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('enrolled', true, 'uid', p_uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_enroll_student(UUID, UUID) TO authenticated;

-- ── staff_unenroll_student ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_unenroll_student(
  p_course_id UUID,
  p_uid       UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_role TEXT := current_user_role();
BEGIN
  IF v_role NOT IN ('admin', 'manager', 'teacher') THEN
    RAISE EXCEPTION 'Only staff can unenroll students';
  END IF;

  IF v_role = 'teacher' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.courses
       WHERE id = p_course_id AND owner_id = current_user_uid()
    ) THEN
      RAISE EXCEPTION 'You can only unenroll students from your own courses';
    END IF;
  END IF;

  DELETE FROM public.enrollments
   WHERE user_id = p_uid AND course_id = p_course_id;

  RETURN json_build_object('unenrolled', true, 'uid', p_uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_unenroll_student(UUID, UUID) TO authenticated;
