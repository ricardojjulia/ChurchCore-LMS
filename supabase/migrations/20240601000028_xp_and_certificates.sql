-- Migration 028: XP award system + certificates table
-- Adds atomic XP award function, level thresholds, and course certificates

-- ── Level thresholds (cumulative XP to reach each level) ─────────────────────
-- Level 1: 0 XP (default)
-- Level 2: 100 XP
-- Level 3: 250 XP
-- Level 4: 500 XP
-- Level 5: 1,000 XP
-- Level 6: 2,000 XP
-- Level 7: 4,000 XP
-- Level 8: 8,000 XP
-- Level 9: 15,000 XP
-- Level 10: 30,000 XP

CREATE OR REPLACE FUNCTION public.calculate_level(p_xp INTEGER)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN p_xp < 100   THEN 1
    WHEN p_xp < 250   THEN 2
    WHEN p_xp < 500   THEN 3
    WHEN p_xp < 1000  THEN 4
    WHEN p_xp < 2000  THEN 5
    WHEN p_xp < 4000  THEN 6
    WHEN p_xp < 8000  THEN 7
    WHEN p_xp < 15000 THEN 8
    WHEN p_xp < 30000 THEN 9
    ELSE 10
  END;
$$;

-- ── award_xp: atomically adds XP and recalculates level ──────────────────────
-- Returns JSON with new_xp, new_level, leveled_up, prev_level
CREATE OR REPLACE FUNCTION public.award_xp(
  p_uid    UUID,
  p_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_old_xp    INTEGER;
  v_new_xp    INTEGER;
  v_old_level INTEGER;
  v_new_level INTEGER;
BEGIN
  -- Validate caller owns this uid
  IF current_user_uid() IS DISTINCT FROM p_uid THEN
    -- Staff (admin/manager) can award XP; students can only award to themselves
    IF current_user_role() NOT IN ('admin', 'manager', 'teacher') THEN
      RAISE EXCEPTION 'Not authorized to award XP to another user';
    END IF;
  END IF;

  IF p_amount <= 0 THEN RETURN json_build_object('error', 'XP amount must be positive'); END IF;

  SELECT xp_points, current_level
    INTO v_old_xp, v_old_level
    FROM public.profiles
   WHERE uid = p_uid
     FOR UPDATE;

  IF NOT FOUND THEN RETURN json_build_object('error', 'Profile not found'); END IF;

  v_new_xp    := COALESCE(v_old_xp, 0) + p_amount;
  v_new_level := public.calculate_level(v_new_xp);

  UPDATE public.profiles
     SET xp_points     = v_new_xp,
         current_level = v_new_level
   WHERE uid = p_uid;

  RETURN json_build_object(
    'new_xp',     v_new_xp,
    'new_level',  v_new_level,
    'leveled_up', v_new_level > COALESCE(v_old_level, 1),
    'prev_level', COALESCE(v_old_level, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_xp(UUID, INTEGER) TO authenticated;

-- ── course_certificates table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_certificates (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  course_id      UUID        NOT NULL REFERENCES public.courses(id)   ON DELETE CASCADE,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  final_grade    NUMERIC(5,2),          -- average grade % at time of issue
  letter_grade   TEXT,
  total_xp_earned INTEGER   DEFAULT 0,
  certificate_no TEXT        UNIQUE NOT NULL DEFAULT ('CERT-' || UPPER(SUBSTR(gen_random_uuid()::TEXT, 1, 8))),
  UNIQUE (user_id, course_id)            -- one certificate per student per course
);

ALTER TABLE public.course_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "certificates: user reads own"
  ON public.course_certificates FOR SELECT TO authenticated
  USING (user_id = current_user_uid());

CREATE POLICY "certificates: staff reads"
  ON public.course_certificates FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'manager', 'teacher'));

CREATE INDEX IF NOT EXISTS idx_certificates_user
  ON public.course_certificates (user_id, issued_at DESC);

-- ── issue_certificate: idempotent certificate award on course completion ──────
CREATE OR REPLACE FUNCTION public.issue_certificate(
  p_uid       UUID,
  p_course_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_cert_id      UUID;
  v_cert_no      TEXT;
  v_final_grade  NUMERIC(5,2);
  v_letter       TEXT;
  v_xp           INTEGER;
  v_course_title TEXT;
BEGIN
  -- Verify enrollment is completed
  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments
     WHERE user_id   = p_uid
       AND course_id = p_course_id
       AND transit_status = 'completed'
  ) THEN
    RETURN json_build_object('error', 'Enrollment not completed');
  END IF;

  SELECT title INTO v_course_title FROM public.courses WHERE id = p_course_id;

  -- Get grade summary from MV
  SELECT average_grade, letter_grade, total_xp_earned
    INTO v_final_grade, v_letter, v_xp
    FROM public.mv_academic_performance
   WHERE user_id   = p_uid
     AND course_id = p_course_id
   LIMIT 1;

  -- Upsert certificate
  INSERT INTO public.course_certificates
    (user_id, course_id, final_grade, letter_grade, total_xp_earned)
  VALUES
    (p_uid, p_course_id, v_final_grade, COALESCE(v_letter, 'N/A'), COALESCE(v_xp, 0))
  ON CONFLICT (user_id, course_id) DO NOTHING
  RETURNING id, certificate_no INTO v_cert_id, v_cert_no;

  -- If newly issued, send notification
  IF v_cert_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      p_uid,
      'certificate_earned',
      'Certificate earned — ' || COALESCE(v_course_title, 'Course'),
      'Congratulations! You completed the course' ||
        CASE WHEN v_final_grade IS NOT NULL
          THEN ' with a grade of ' || v_final_grade || '%.'
          ELSE '.'
        END,
      '/certificates'
    );
  END IF;

  SELECT id, certificate_no INTO v_cert_id, v_cert_no
    FROM public.course_certificates
   WHERE user_id = p_uid AND course_id = p_course_id;

  RETURN json_build_object(
    'certificate_id', v_cert_id,
    'certificate_no', v_cert_no,
    'final_grade',    v_final_grade,
    'letter_grade',   COALESCE(v_letter, 'N/A')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_certificate(UUID, UUID) TO authenticated;
