-- Migration 031: Fix Supabase security linter warnings
--
-- Addresses:
-- 1. function_search_path_mutable (WARN) — 6 functions missing SET search_path = public
-- 2. materialized_view_in_api (WARN) — mv_academic_performance directly accessible via REST
-- 3. anon_security_definer_function_executable (WARN) — revoke EXECUTE from anon on all SECURITY DEFINER fns
-- 4. authenticated_security_definer_function_executable (WARN, partial) — revoke trigger-only
--    and admin-only functions from authenticated; user-facing RPCs intentionally remain granted

-- ── 1. Add SET search_path = public to functions missing it ──────────────────

-- XP level recalculation trigger
CREATE OR REPLACE FUNCTION public.handle_xp_level_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  calculated_level INT;
BEGIN
  calculated_level := 1 + FLOOR(SQRT(NEW.xp_points::FLOAT / 100));
  IF calculated_level <> NEW.current_level THEN
    NEW.current_level := calculated_level;
  END IF;
  RETURN NEW;
END;
$$;

-- Auth user → profiles provisioning trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (auth_id, display_name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'student',
    'active'
  );
  RETURN NEW;
END;
$$;

-- Generic updated_at trigger (not SECURITY DEFINER — add search_path only)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Student ID generator
CREATE OR REPLACE FUNCTION public.generate_student_id()
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RETURN 'CC-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
    LPAD(nextval('public.student_id_seq')::TEXT, 6, '0');
END;
$$;

-- Student ID assignment trigger
CREATE OR REPLACE FUNCTION public.assign_student_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'student' AND NEW.student_id IS NULL THEN
    NEW.student_id := public.generate_student_id();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Level calculator (already IMMUTABLE; add search_path)
CREATE OR REPLACE FUNCTION public.calculate_level(p_xp INTEGER)
RETURNS INTEGER LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
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

-- ── 2. Revoke direct REST access to mv_academic_performance ──────────────────
-- Accessible only through SECURITY DEFINER accessor functions.
-- Direct access bypasses role-based access checks inside those functions.
REVOKE SELECT ON public.mv_academic_performance FROM anon;
REVOKE SELECT ON public.mv_academic_performance FROM authenticated;

-- ── 3. Revoke EXECUTE from anon on all SECURITY DEFINER functions ─────────────
-- Unauthenticated callers have no legitimate use for any of these RPCs.

REVOKE EXECUTE ON FUNCTION public.assign_student_id()                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_xp(UUID, INTEGER)                FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_unread_message_threads()          FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_level()                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_org_id()                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role()                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_status()                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_uid()                      FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_student_id()                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_block_discussion_replies(UUID)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_course_performance(UUID)            FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_course_submissions(UUID)            FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_academic_performance()           FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_overall_gpa()                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at()                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_xp_level_escalation()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.issue_certificate(UUID, UUID)           FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_academic_performance()          FROM anon;
REVOKE EXECUTE ON FUNCTION public.staff_enroll_student(UUID, UUID)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.staff_unenroll_student(UUID, UUID)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_profile_roles()                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_thread_on_message()              FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_level(INTEGER)               FROM anon;

-- ── 4. Revoke trigger-only functions from authenticated ───────────────────────
-- These exist only to service database triggers; no application code should
-- ever call them directly through the REST API (/rpc/).
-- Triggers execute as the table owner (postgres), so this revoke does not
-- break any trigger behavior.

REVOKE EXECUTE ON FUNCTION public.handle_new_user()            FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_xp_level_escalation() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at()          FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_student_id()          FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_student_id()        FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_roles()         FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_thread_on_message()   FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_academic_performance() FROM authenticated;

-- Note on remaining authenticated_security_definer_function_executable warnings:
-- The following RPCs are intentionally executable by authenticated users.
-- Their SECURITY DEFINER bodies already validate caller identity and role.
-- No action needed:
--   current_user_uid, current_user_role, current_user_level, current_user_org_id,
--   current_user_status, count_unread_message_threads, award_xp,
--   get_block_discussion_replies, get_course_performance, get_course_submissions,
--   get_my_academic_performance, get_my_overall_gpa, issue_certificate,
--   staff_enroll_student, staff_unenroll_student, calculate_level
