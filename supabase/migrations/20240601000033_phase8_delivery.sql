-- Phase 8: Delivery & Communication
-- 1. guardian role + guardian_links table
-- 2. Live session block type activation
-- 3. Email digest columns on profiles
-- 4. SECURITY DEFINER access functions for guardian portal

-- ─── 1. Add guardian to user_role ENUM ────────────────────────────────────────

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'guardian';

-- ─── 2. Guardian links ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.guardian_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_uid UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  student_uid  UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES public.profiles(uid),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT guardian_links_unique UNIQUE (guardian_uid, student_uid),
  CONSTRAINT no_self_guardian CHECK (guardian_uid <> student_uid)
);

ALTER TABLE public.guardian_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guardian_links: guardian reads own"
  ON public.guardian_links FOR SELECT
  USING (guardian_uid = current_user_uid());

CREATE POLICY "guardian_links: staff reads all"
  ON public.guardian_links FOR SELECT
  USING (current_user_role() IN ('admin', 'manager', 'teacher'));

-- ─── 3. Email digest columns ──────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_digest_sent_at  TIMESTAMPTZ;

-- ─── 4. Activate live session block type ─────────────────────────────────────

UPDATE public.block_types SET is_active = TRUE WHERE id = 'live_session';

-- ─── 5. Guardian SECURITY DEFINER functions ───────────────────────────────────

-- Returns all students linked to the calling guardian
CREATE OR REPLACE FUNCTION public.get_guardian_students()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid    UUID;
  v_result JSON;
BEGIN
  SELECT uid INTO v_uid FROM public.profiles WHERE auth_id = auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;

  SELECT json_agg(json_build_object(
    'student_uid',      p.uid,
    'display_name',     p.display_name,
    'student_id',       p.student_id,
    'current_level',    p.current_level,
    'xp',               p.xp,
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

-- Returns full read-only overview of one student — verifies guardian link first
CREATE OR REPLACE FUNCTION public.get_guardian_student_overview(p_student_uid UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_guardian_uid UUID;
  v_result       JSON;
BEGIN
  SELECT uid INTO v_guardian_uid FROM public.profiles WHERE auth_id = auth.uid();
  IF v_guardian_uid IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.guardian_links
    WHERE guardian_uid = v_guardian_uid AND student_uid = p_student_uid
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
        'xp',            p.xp
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
        SELECT * FROM public.block_submissions
        WHERE user_id = p_student_uid AND status = 'graded'
        ORDER BY graded_at DESC NULLS LAST
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

-- Staff-only: link a guardian (looked up by email) to a student
CREATE OR REPLACE FUNCTION public.link_guardian_to_student(
  p_student_uid    UUID,
  p_guardian_email TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_staff_uid    UUID;
  v_staff_role   TEXT;
  v_guardian_uid UUID;
BEGIN
  SELECT uid, role INTO v_staff_uid, v_staff_role
  FROM public.profiles WHERE auth_id = auth.uid();

  IF v_staff_uid IS NULL OR v_staff_role NOT IN ('admin', 'manager', 'teacher') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT uid INTO v_guardian_uid
  FROM public.profiles
  WHERE lower(email) = lower(trim(p_guardian_email));

  IF v_guardian_uid IS NULL THEN
    RETURN json_build_object('error', 'No account found with that email address. The guardian must sign up first.');
  END IF;

  IF v_guardian_uid = p_student_uid THEN
    RETURN json_build_object('error', 'A student cannot be their own guardian');
  END IF;

  INSERT INTO public.guardian_links (guardian_uid, student_uid, created_by)
  VALUES (v_guardian_uid, p_student_uid, v_staff_uid)
  ON CONFLICT (guardian_uid, student_uid) DO NOTHING;

  RETURN json_build_object('ok', true, 'guardian_uid', v_guardian_uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_guardian_to_student(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.link_guardian_to_student(UUID, TEXT) FROM anon;

-- Staff-only: remove a guardian link
CREATE OR REPLACE FUNCTION public.unlink_guardian_from_student(
  p_guardian_uid UUID,
  p_student_uid  UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_staff_uid  UUID;
  v_staff_role TEXT;
BEGIN
  SELECT uid, role INTO v_staff_uid, v_staff_role
  FROM public.profiles WHERE auth_id = auth.uid();

  IF v_staff_uid IS NULL OR v_staff_role NOT IN ('admin', 'manager', 'teacher') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  DELETE FROM public.guardian_links
  WHERE guardian_uid = p_guardian_uid AND student_uid = p_student_uid;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlink_guardian_from_student(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.unlink_guardian_from_student(UUID, UUID) FROM anon;
