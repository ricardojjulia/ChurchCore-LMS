-- ============================================================
-- Migration: Academic Bridge Hardening & Capacity Enforcement
--
-- 1. Updates bridge_section_to_course_enrollment() with deterministic
--    course selection (published status prioritized, latest updated_at)
-- 2. Adds enforce_section_capacity() trigger on direct_enrollments
--    to prevent over-enrollment beyond section max_enrollment.
-- 3. Adds enforce_section_capacity_reduction() on course_sections
--    to prevent lowering max_enrollment below current active count.
-- ============================================================

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
  ORDER BY (c.status = 'published') DESC, c.updated_at DESC
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

-- Capacity enforcement on direct_enrollments
CREATE OR REPLACE FUNCTION public.enforce_section_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max_enrollment integer;
  v_current_count integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT max_enrollment INTO v_max_enrollment
  FROM public.course_sections
  WHERE id = NEW.section_id;

  IF v_max_enrollment IS NOT NULL THEN
    SELECT count(*)::integer INTO v_current_count
    FROM public.direct_enrollments
    WHERE section_id = NEW.section_id
      AND status = 'active'
      AND user_id <> NEW.user_id;

    IF v_current_count >= v_max_enrollment THEN
      RAISE EXCEPTION 'This section has reached its maximum enrollment capacity.'
        USING ERRCODE = 'PCC01';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_section_capacity() FROM anon, public;

DROP TRIGGER IF EXISTS trg_enforce_section_capacity ON public.direct_enrollments;
CREATE TRIGGER trg_enforce_section_capacity
  BEFORE INSERT OR UPDATE OF status, section_id ON public.direct_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_section_capacity();

-- Capacity reduction protection on course_sections
CREATE OR REPLACE FUNCTION public.enforce_section_capacity_reduction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current_count integer;
BEGIN
  IF NEW.max_enrollment IS NOT NULL
    AND (OLD.max_enrollment IS NULL OR NEW.max_enrollment < OLD.max_enrollment) THEN
    SELECT count(*)::integer INTO v_current_count
    FROM public.direct_enrollments
    WHERE section_id = NEW.id
      AND status = 'active';

    IF v_current_count > NEW.max_enrollment THEN
      RAISE EXCEPTION 'The maximum section enrollment cannot be lower than the active enrollment count.'
        USING ERRCODE = 'PCC01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_section_capacity_reduction() FROM anon, public;

DROP TRIGGER IF EXISTS trg_enforce_section_capacity_reduction ON public.course_sections;
CREATE TRIGGER trg_enforce_section_capacity_reduction
  BEFORE UPDATE OF max_enrollment ON public.course_sections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_section_capacity_reduction();
