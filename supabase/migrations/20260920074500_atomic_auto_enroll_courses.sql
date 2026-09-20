-- ─── add_auto_enroll_course() / remove_auto_enroll_course(): atomic JSONB ──────
-- array mutation for organizations.settings.auto_enroll_courses.
--
-- src/app/actions/org-settings.ts previously did a plain read-modify-write
-- (SELECT settings, mutate in JS, UPDATE settings) to add/remove a course from
-- this list. Two concurrent admin actions on the same org (e.g. two admins, or
-- one admin double-clicking) can both read the same starting settings and each
-- write back a version that silently discards the other's change — the same
-- class of race already fixed for platform_feedback in
-- 20260919120000_atomic_platform_feedback_upsert.sql. These functions replace
-- the read-modify-write with a single atomic statement per mutation, using
-- SELECT ... FOR UPDATE to serialize concurrent callers on the same org row.
--
-- SECURITY INVOKER (the default — stated explicitly per CLAUDE.md Security
-- Rule 1) — grants no privilege beyond what the calling role already has.
-- Callable only by service_role (see GRANT below); the application-level
-- org/platform-admin authorization check (assertOrgAdminOrPlatformAdmin())
-- happens in org-settings.ts before either function is ever called, exactly
-- mirroring how the feedback route authorizes before calling its own atomic
-- RPC.

CREATE OR REPLACE FUNCTION public.add_auto_enroll_course(
  p_org_id    uuid,
  p_course_id uuid,
  p_max       integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_current jsonb;
  v_updated jsonb;
BEGIN
  SELECT COALESCE(settings -> 'auto_enroll_courses', '[]'::jsonb)
  INTO v_current
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'org_not_found';
  END IF;

  IF v_current ? p_course_id::text THEN
    RETURN v_current; -- already present — no-op success, not a cap violation
  END IF;

  IF jsonb_array_length(v_current) >= p_max THEN
    RAISE EXCEPTION 'auto_enroll_cap_exceeded';
  END IF;

  v_updated := v_current || to_jsonb(p_course_id::text);

  UPDATE public.organizations
  SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{auto_enroll_courses}', v_updated)
  WHERE id = p_org_id;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.add_auto_enroll_course(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_auto_enroll_course(uuid, uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.remove_auto_enroll_course(
  p_org_id    uuid,
  p_course_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_current jsonb;
  v_updated jsonb;
BEGIN
  SELECT COALESCE(settings -> 'auto_enroll_courses', '[]'::jsonb)
  INTO v_current
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'org_not_found';
  END IF;

  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  INTO v_updated
  FROM jsonb_array_elements(v_current) elem
  WHERE elem <> to_jsonb(p_course_id::text);

  UPDATE public.organizations
  SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{auto_enroll_courses}', v_updated)
  WHERE id = p_org_id;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_auto_enroll_course(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_auto_enroll_course(uuid, uuid) TO service_role;
