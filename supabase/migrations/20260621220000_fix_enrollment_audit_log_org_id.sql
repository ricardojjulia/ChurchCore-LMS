-- ─── Fix enforce_enrollment_state_machine: include org_id in audit log ────────
-- Phase 2 migration added org_id NOT NULL to enrollment_audit_log, but the
-- trigger that inserts into it predates that column. Add NEW.org_id to the INSERT.

CREATE OR REPLACE FUNCTION public.enforce_enrollment_state_machine()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- No-op if status unchanged
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  -- Reject transitions out of terminal states
  IF OLD.status IN ('completed', 'withdrawn') THEN
    RAISE EXCEPTION
      'Enrollment % is in terminal state "%" and cannot be transitioned to "%"',
      OLD.id, OLD.status, NEW.status;
  END IF;

  -- Valid transitions
  IF NOT (
    (OLD.status = 'pending'   AND NEW.status IN ('active', 'withdrawn')) OR
    (OLD.status = 'active'    AND NEW.status IN ('suspended', 'withdrawn', 'completed')) OR
    (OLD.status = 'suspended' AND NEW.status IN ('active', 'withdrawn'))
  ) THEN
    RAISE EXCEPTION
      'Invalid enrollment transition: "%" → "%"', OLD.status, NEW.status;
  END IF;

  -- Timestamp terminal transitions
  IF NEW.status = 'completed' THEN
    NEW.completed_at := NOW();
  END IF;
  IF NEW.status = 'withdrawn' THEN
    NEW.withdrawn_at      := NOW();
    NEW.retain_data_until := NOW() + INTERVAL '7 years';
  END IF;

  -- Mandatory audit entry (org_id added after Phase 2 NOT NULL constraint)
  INSERT INTO public.enrollment_audit_log
    (enrollment_id, user_id, section_id, org_id, from_status, to_status, changed_by)
  VALUES
    (NEW.id, NEW.user_id, NEW.section_id, NEW.org_id, OLD.status, NEW.status,
     COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID));

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_enrollment_state_machine() FROM anon, public;
