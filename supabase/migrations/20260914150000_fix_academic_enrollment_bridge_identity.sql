-- direct_enrollments.user_id references auth.users(id), while enrollments.user_id
-- references profiles(uid). Resolve that identity boundary inside the bridge.

CREATE OR REPLACE FUNCTION public.bridge_section_to_course_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id UUID;
  v_profile_uid UUID;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT p.uid
  INTO v_profile_uid
  FROM public.profiles p
  WHERE p.auth_id = NEW.user_id;

  IF v_profile_uid IS NULL THEN
    RAISE EXCEPTION 'No LMS profile exists for enrollment auth user';
  END IF;

  SELECT c.id
  INTO v_course_id
  FROM public.courses c
  JOIN public.course_sections cs ON cs.blueprint_id = c.blueprint_id
  WHERE cs.id = NEW.section_id
    AND c.blueprint_id IS NOT NULL
  LIMIT 1;

  IF v_course_id IS NOT NULL THEN
    INSERT INTO public.enrollments (
      user_id,
      course_id,
      section_id,
      transit_status,
      progress_percent,
      org_id
    )
    VALUES (
      v_profile_uid,
      v_course_id,
      NEW.section_id,
      'not_started',
      0,
      NEW.org_id
    )
    ON CONFLICT (user_id, course_id) DO UPDATE
      SET section_id = EXCLUDED.section_id
      WHERE enrollments.section_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bridge_section_to_course_enrollment() FROM anon, public;

CREATE OR REPLACE FUNCTION public.sync_section_withdrawal_to_course()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_uid UUID;
BEGIN
  IF NEW.status = 'withdrawn' AND OLD.status = 'active' THEN
    SELECT p.uid
    INTO v_profile_uid
    FROM public.profiles p
    WHERE p.auth_id = NEW.user_id;

    UPDATE public.enrollments
    SET transit_status = 'dropped'
    WHERE user_id = v_profile_uid
      AND section_id = NEW.section_id
      AND transit_status NOT IN ('completed', 'dropped');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_section_withdrawal_to_course() FROM anon, public;

CREATE OR REPLACE FUNCTION public.count_unsynced_bridge_enrollments()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.direct_enrollments de
  JOIN public.profiles p ON p.auth_id = de.user_id
  JOIN public.course_sections cs ON cs.id = de.section_id
  JOIN public.courses c ON c.blueprint_id = cs.blueprint_id
  WHERE c.blueprint_id IS NOT NULL
    AND de.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.user_id = p.uid
        AND e.course_id = c.id
    );
$$;

REVOKE ALL ON FUNCTION public.count_unsynced_bridge_enrollments() FROM public;
GRANT EXECUTE ON FUNCTION public.count_unsynced_bridge_enrollments() TO service_role;
