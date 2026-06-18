-- ============================================================
-- Migration: 20250710090300_reporting_indexes.sql
-- Description: Reporting query and lifecycle indexes
-- ADR: ADR-2025-012 Amendment 001
-- Author: ChurchCore LMS Engineering
-- Date: 2025-07-10
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_analytics_events_org_user
  ON public.analytics_events(org_id, user_id);
COMMENT ON INDEX public.idx_analytics_events_org_user IS
  'Supports student-scoped analytics timelines and self-export queries.';

CREATE INDEX IF NOT EXISTS idx_analytics_events_org_course
  ON public.analytics_events(org_id, course_id);
COMMENT ON INDEX public.idx_analytics_events_org_course IS
  'Supports instructor/admin course engagement reporting.';

CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_at_desc
  ON public.analytics_events(occurred_at DESC);
COMMENT ON INDEX public.idx_analytics_events_occurred_at_desc IS
  'Supports recent activity windows and lifecycle pruning scans.';

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_org
  ON public.analytics_events(event_type, org_id);
COMMENT ON INDEX public.idx_analytics_events_type_org IS
  'Supports event-type filtered reporting by organization.';

CREATE INDEX IF NOT EXISTS idx_report_artifacts_complete_expires_at
  ON public.report_artifacts(expires_at)
  WHERE generation_status = 'complete';
COMMENT ON INDEX public.idx_report_artifacts_complete_expires_at IS
  'Supports lifecycle scans for completed artifacts approaching expiration.';

CREATE INDEX IF NOT EXISTS idx_report_audit_log_org_occurred_at
  ON public.report_audit_log(org_id, occurred_at DESC);
COMMENT ON INDEX public.idx_report_audit_log_org_occurred_at IS
  'Supports organization audit timeline queries.';

CREATE INDEX IF NOT EXISTS idx_report_audit_log_actor_occurred_at
  ON public.report_audit_log(actor_id, occurred_at DESC);
COMMENT ON INDEX public.idx_report_audit_log_actor_occurred_at IS
  'Supports actor-specific audit history and student self-export review.';

CREATE INDEX IF NOT EXISTS idx_report_audit_log_action_org
  ON public.report_audit_log(action, org_id);
COMMENT ON INDEX public.idx_report_audit_log_action_org IS
  'Supports action-filtered compliance reporting by organization.';

CREATE INDEX IF NOT EXISTS idx_report_audit_log_resource_id
  ON public.report_audit_log(resource_id)
  WHERE resource_id IS NOT NULL;
COMMENT ON INDEX public.idx_report_audit_log_resource_id IS
  'Supports artifact and report-definition audit lookups by resource id.';

CREATE INDEX IF NOT EXISTS idx_report_audit_log_student_self_export
  ON public.report_audit_log(org_id, actor_id, occurred_at DESC)
  WHERE action = 'student_self_export';
COMMENT ON INDEX public.idx_report_audit_log_student_self_export IS
  'Supports FERPA student self-export audit review.';

CREATE INDEX IF NOT EXISTS idx_report_audit_log_archival_candidates
  ON public.report_audit_log(retention_class, occurred_at)
  WHERE archived_at IS NULL;
COMMENT ON INDEX public.idx_report_audit_log_archival_candidates IS
  'Supports lifecycle manager scans for unarchived audit rows by retention class.';

CREATE INDEX IF NOT EXISTS idx_report_definitions_org_type
  ON public.report_definitions(org_id, report_type);
COMMENT ON INDEX public.idx_report_definitions_org_type IS
  'Supports report catalog filtering by organization and report type.';

CREATE INDEX IF NOT EXISTS idx_course_certificates_user_course
  ON public.course_certificates(user_id, course_id);
COMMENT ON INDEX public.idx_course_certificates_user_course IS
  'Supports student certificate lookup and organization scoping through course joins.';

CREATE INDEX IF NOT EXISTS idx_course_certificates_pdf_pending
  ON public.course_certificates(pdf_generation_status)
  WHERE pdf_generation_status = 'pending';
COMMENT ON INDEX public.idx_course_certificates_pdf_pending IS
  'Supports certificate PDF generation queue scans.';
