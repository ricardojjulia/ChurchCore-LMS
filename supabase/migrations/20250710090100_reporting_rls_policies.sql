-- ============================================================
-- Migration: 20250710090100_reporting_rls_policies.sql
-- Description: RLS policies for all reporting tables
-- Security Level: CRITICAL — do not modify without Security Lead review
-- ADR: ADR-2025-012 Amendment 001
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.get_caller_profile()
RETURNS TABLE(org_id UUID, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.org_id, pr.role::TEXT
  FROM public.profile_roles pr
  WHERE pr.auth_id = auth.uid()
    AND pr.status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.get_caller_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_caller_profile() TO authenticated;

ALTER TABLE public.report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.report_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_artifacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.report_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.course_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_certificates FORCE ROW LEVEL SECURITY;

-- ============================================================
-- report_definitions policies
-- ============================================================

DROP POLICY IF EXISTS "rls_report_definitions_insert_admin_instructor" ON public.report_definitions;
DROP POLICY IF EXISTS "rls_report_definitions_select_own_or_admin" ON public.report_definitions;
DROP POLICY IF EXISTS "rls_report_definitions_update_own_or_admin" ON public.report_definitions;
DROP POLICY IF EXISTS "rls_report_definitions_delete_own_or_admin" ON public.report_definitions;

CREATE POLICY "rls_report_definitions_insert_admin_instructor"
  ON public.report_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = public.current_user_uid()
    AND EXISTS (
      SELECT 1
      FROM private.get_caller_profile() caller
      WHERE caller.org_id = report_definitions.org_id
        AND caller.role IN ('admin', 'teacher', 'instructor')
    )
  );

CREATE POLICY "rls_report_definitions_select_own_or_admin"
  ON public.report_definitions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.get_caller_profile() caller
      WHERE caller.org_id = report_definitions.org_id
        AND (
          caller.role = 'admin'
          OR report_definitions.created_by = public.current_user_uid()
        )
    )
  );

CREATE POLICY "rls_report_definitions_update_own_or_admin"
  ON public.report_definitions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.get_caller_profile() caller
      WHERE caller.org_id = report_definitions.org_id
        AND (
          caller.role = 'admin'
          OR report_definitions.created_by = public.current_user_uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM private.get_caller_profile() caller
      WHERE caller.org_id = report_definitions.org_id
        AND (
          caller.role = 'admin'
          OR report_definitions.created_by = public.current_user_uid()
        )
    )
  );

CREATE POLICY "rls_report_definitions_delete_own_or_admin"
  ON public.report_definitions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.get_caller_profile() caller
      WHERE caller.org_id = report_definitions.org_id
        AND (
          caller.role = 'admin'
          OR report_definitions.created_by = public.current_user_uid()
        )
    )
  );

-- ============================================================
-- report_artifacts policies
-- ============================================================

DROP POLICY IF EXISTS "rls_report_artifacts_select_own_or_admin" ON public.report_artifacts;

CREATE POLICY "rls_report_artifacts_select_own_or_admin"
  ON public.report_artifacts
  FOR SELECT
  TO authenticated
  USING (
    (expires_at IS NULL OR expires_at > NOW())
    AND EXISTS (
      SELECT 1
      FROM private.get_caller_profile() caller
      WHERE caller.org_id = report_artifacts.org_id
        AND (
          caller.role = 'admin'
          OR report_artifacts.generated_by = public.current_user_uid()
        )
    )
  );

-- No INSERT, UPDATE, or DELETE policies are defined for authenticated users.
-- Report artifact writes are service-role only.

-- ============================================================
-- analytics_events policies
-- ============================================================

DROP POLICY IF EXISTS "rls_analytics_events_insert_enrolled_only" ON public.analytics_events;
DROP POLICY IF EXISTS "rls_analytics_events_select_scoped" ON public.analytics_events;

CREATE POLICY "rls_analytics_events_insert_enrolled_only"
  ON public.analytics_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = public.current_user_uid()
    AND EXISTS (
      SELECT 1
      FROM private.get_caller_profile() caller
      WHERE caller.org_id = analytics_events.org_id
    )
    AND (
      course_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.enrollments e
        WHERE e.user_id = public.current_user_uid()
          AND e.course_id = analytics_events.course_id
      )
    )
  );

CREATE POLICY "rls_analytics_events_select_scoped"
  ON public.analytics_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.get_caller_profile() caller
      WHERE caller.org_id = analytics_events.org_id
        AND (
          analytics_events.user_id = public.current_user_uid()
          OR caller.role = 'admin'
          OR (
            caller.role IN ('teacher', 'instructor')
            AND analytics_events.course_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.courses c
              WHERE c.id = analytics_events.course_id
                AND c.owner_id = public.current_user_uid()
            )
          )
        )
    )
  );

-- ============================================================
-- report_audit_log policies
-- ============================================================

DROP POLICY IF EXISTS "rls_audit_log_admin_select" ON public.report_audit_log;
DROP POLICY IF EXISTS "rls_audit_log_instructor_select" ON public.report_audit_log;
DROP POLICY IF EXISTS "rls_audit_log_student_select" ON public.report_audit_log;

CREATE POLICY "rls_audit_log_admin_select"
  ON public.report_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.get_caller_profile() caller
      WHERE caller.org_id = report_audit_log.org_id
        AND caller.role = 'admin'
    )
  );

CREATE POLICY "rls_audit_log_instructor_select"
  ON public.report_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.get_caller_profile() caller
      WHERE caller.org_id = report_audit_log.org_id
        AND caller.role IN ('teacher', 'instructor')
        AND (
          report_audit_log.actor_id = public.current_user_uid()
          OR (
            report_audit_log.target_course_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.courses c
              WHERE c.id = report_audit_log.target_course_id
                AND c.owner_id = public.current_user_uid()
            )
          )
        )
    )
  );

CREATE POLICY "rls_audit_log_student_select"
  ON public.report_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.get_caller_profile() caller
      WHERE caller.org_id = report_audit_log.org_id
        AND caller.role = 'student'
        AND report_audit_log.actor_id = public.current_user_uid()
    )
  );

-- No INSERT, UPDATE, or DELETE policies are defined for authenticated users.
-- Audit log writes are service-role only and immutable by rule.

-- ============================================================
-- course_certificates policies
-- ============================================================

DROP POLICY IF EXISTS "certificates: user reads own" ON public.course_certificates;
DROP POLICY IF EXISTS "certificates: staff reads" ON public.course_certificates;
DROP POLICY IF EXISTS "rls_certificates_student_select" ON public.course_certificates;
DROP POLICY IF EXISTS "rls_certificates_instructor_admin_select" ON public.course_certificates;

CREATE POLICY "rls_certificates_student_select"
  ON public.course_certificates
  FOR SELECT
  TO authenticated
  USING (
    user_id = public.current_user_uid()
    AND EXISTS (
      SELECT 1
      FROM public.courses c
      JOIN private.get_caller_profile() caller ON caller.org_id = c.org_id
      WHERE c.id = course_certificates.course_id
    )
  );

CREATE POLICY "rls_certificates_instructor_admin_select"
  ON public.course_certificates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.courses c
      JOIN private.get_caller_profile() caller ON caller.org_id = c.org_id
      WHERE c.id = course_certificates.course_id
        AND caller.role IN ('admin', 'teacher', 'instructor')
        AND (
          caller.role = 'admin'
          OR c.owner_id = public.current_user_uid()
        )
    )
  );
