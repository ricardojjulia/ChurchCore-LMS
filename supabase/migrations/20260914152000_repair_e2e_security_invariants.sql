-- Remove legacy profile policies that bypass tenant isolation. The current
-- tenant-aware policies were added later but PostgreSQL ORs permissive policies.
DROP POLICY IF EXISTS "profiles: admin manager read all" ON public.profiles;
DROP POLICY IF EXISTS "profiles: self read" ON public.profiles;
DROP POLICY IF EXISTS "profiles: teacher read enrolled students" ON public.profiles;
DROP POLICY IF EXISTS "profiles: admin full update" ON public.profiles;
DROP POLICY IF EXISTS "profiles: self update non-privileged fields" ON public.profiles;
DROP POLICY IF EXISTS "profiles: admin insert" ON public.profiles;

CREATE OR REPLACE FUNCTION public.current_user_uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT uid
  FROM public.profile_roles
  WHERE auth_id = auth.uid()
    AND status = 'active'
    AND tenant_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profile_roles
  WHERE auth_id = auth.uid()
    AND status = 'active'
    AND tenant_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM public.profile_roles
  WHERE auth_id = auth.uid()
    AND status = 'active'
    AND tenant_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.sync_org_status_to_profile_roles_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profile_roles
  SET tenant_active = NEW.status NOT IN ('suspended', 'deleted')
  WHERE org_id = NEW.id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_org_status_to_profile_roles_trigger()
  FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_sync_org_status_to_profile_roles ON public.organizations;
CREATE TRIGGER trg_sync_org_status_to_profile_roles
AFTER UPDATE OF status ON public.organizations
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_org_status_to_profile_roles_trigger();

-- Service-role changes have no auth.uid(). Represent them as a nullable actor
-- instead of inventing an Auth UUID that violates the foreign key.
ALTER TABLE public.enrollment_audit_log
  ALTER COLUMN changed_by DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_enrollment_state_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  IF OLD.status IN ('completed', 'withdrawn') THEN
    RAISE EXCEPTION
      'Enrollment % is in terminal state "%" and cannot be transitioned to "%"',
      OLD.id, OLD.status, NEW.status;
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('active', 'withdrawn')) OR
    (OLD.status = 'active' AND NEW.status IN ('suspended', 'withdrawn', 'completed')) OR
    (OLD.status = 'suspended' AND NEW.status IN ('active', 'withdrawn'))
  ) THEN
    RAISE EXCEPTION 'Invalid enrollment transition: "%" -> "%"', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'completed' THEN NEW.completed_at := NOW(); END IF;
  IF NEW.status = 'withdrawn' THEN
    NEW.withdrawn_at := NOW();
    NEW.retain_data_until := NOW() + INTERVAL '7 years';
  END IF;

  INSERT INTO public.enrollment_audit_log
    (enrollment_id, user_id, section_id, org_id, from_status, to_status, changed_by)
  VALUES
    (NEW.id, NEW.user_id, NEW.section_id, NEW.org_id, OLD.status, NEW.status, auth.uid());

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_enrollment_state_machine() FROM anon, public;

CREATE OR REPLACE FUNCTION public.issue_certificate(
  p_uid uuid,
  p_course_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert_id uuid;
  v_cert_no text;
  v_final_grade numeric(5,2);
  v_letter text;
  v_xp integer;
  v_course_title text;
  v_org_id uuid;
BEGIN
  IF public.current_user_uid() IS NULL OR (
    public.current_user_uid() <> p_uid
    AND public.current_user_role() NOT IN ('admin', 'manager', 'teacher')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT p.org_id INTO v_org_id
  FROM public.profiles p
  WHERE p.uid = p_uid;

  IF v_org_id IS NULL OR v_org_id <> public.current_user_org_id() THEN
    RAISE EXCEPTION 'Student is outside the caller tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE user_id = p_uid
      AND course_id = p_course_id
      AND org_id = v_org_id
      AND transit_status = 'completed'
  ) THEN
    RETURN json_build_object('error', 'Enrollment not completed');
  END IF;

  SELECT c.title INTO v_course_title
  FROM public.courses c
  WHERE c.id = p_course_id AND c.org_id = v_org_id;

  SELECT average_grade, letter_grade, total_xp_earned
  INTO v_final_grade, v_letter, v_xp
  FROM public.mv_academic_performance
  WHERE user_id = p_uid AND course_id = p_course_id
  LIMIT 1;

  INSERT INTO public.course_certificates
    (user_id, course_id, org_id, final_grade, letter_grade, total_xp_earned)
  VALUES
    (p_uid, p_course_id, v_org_id, v_final_grade, COALESCE(v_letter, 'N/A'), COALESCE(v_xp, 0))
  ON CONFLICT (user_id, course_id) DO NOTHING
  RETURNING id, certificate_no INTO v_cert_id, v_cert_no;

  IF v_cert_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, org_id, type, title, body, link)
    VALUES (
      p_uid,
      v_org_id,
      'certificate_earned',
      'Certificate earned - ' || COALESCE(v_course_title, 'Course'),
      'Congratulations! You completed the course' ||
        CASE WHEN v_final_grade IS NOT NULL
          THEN ' with a grade of ' || v_final_grade || '%.'
          ELSE '.'
        END,
      '/certificates'
    );
  END IF;

  SELECT id, certificate_no
  INTO v_cert_id, v_cert_no
  FROM public.course_certificates
  WHERE user_id = p_uid AND course_id = p_course_id AND org_id = v_org_id;

  RETURN json_build_object(
    'certificate_id', v_cert_id,
    'certificate_no', v_cert_no,
    'final_grade', v_final_grade,
    'letter_grade', COALESCE(v_letter, 'N/A')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_certificate(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.issue_certificate(uuid, uuid) TO authenticated;
