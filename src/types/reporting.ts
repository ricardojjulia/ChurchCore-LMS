/**
 * @fileoverview ChurchCore LMS Reporting Types
 * @module types/reporting
 * @version 1.0.0
 * @lastModified 2025-07-10
 * @linkedADR ADR-2025-012
 */

export type ReportType =
  | 'gradebook'
  | 'completion'
  | 'engagement'
  | 'attendance'
  | 'certificate'
  | 'custom'

export type ReportFormat = 'pdf' | 'xlsx' | 'json' | 'csv'

export type GenerationStatus = 'pending' | 'processing' | 'complete' | 'failed'

export type RetentionClass = 'standard' | 'ferpa' | 'extended'

export type AuditAction =
  | 'report_created'
  | 'report_viewed'
  | 'report_exported_pdf'
  | 'report_exported_xlsx'
  | 'report_exported_csv'
  | 'report_scheduled'
  | 'report_deleted'
  | 'report_definition_created'
  | 'report_definition_updated'
  | 'report_definition_deleted'
  | 'report_artifact_accessed'
  | 'report_artifact_expired'
  | 'bulk_export_initiated'
  | 'student_self_export'

export type ResourceType = 'report_definition' | 'report_artifact' | 'analytics_dashboard'

export type AnalyticsEventType =
  | 'module_view'
  | 'module_complete'
  | 'assignment_submit'
  | 'quiz_attempt'
  | 'video_watch'
  | 'login'
  | 'certificate_earned'

/**
 * Persistent report template/configuration owned by an organization.
 * Mirrors the `report_definitions` table.
 */
export interface ReportDefinition {
  id: string
  org_id: string
  created_by: string
  name: string
  report_type: ReportType
  config: Record<string, unknown>
  is_scheduled: boolean
  schedule_cron: string | null
  created_at: string
  updated_at: string
}

/**
 * Generated report export artifact and retention metadata.
 * Mirrors the `report_artifacts` table.
 */
export interface ReportArtifact {
  id: string
  report_definition_id: string | null
  org_id: string
  generated_by: string | null
  format: ReportFormat
  storage_path: string | null
  archive_storage_path: string | null
  signed_url: string | null
  signed_url_expires: string | null
  row_count: number | null
  generation_status: GenerationStatus
  error_message: string | null
  generated_at: string
  expires_at: string
  archived_at: string | null
  retention_class: RetentionClass
}

/**
 * Learner activity event used for engagement and audit-grade reporting.
 * Mirrors the `analytics_events` table.
 */
export interface AnalyticsEvent {
  id: string
  org_id: string
  user_id: string
  course_id: string | null
  module_id: string | null
  event_type: AnalyticsEventType
  metadata: Record<string, unknown>
  occurred_at: string
}

/**
 * Immutable reporting audit trail row.
 * Mirrors the `report_audit_log` table.
 */
export interface ReportAuditLog {
  id: string
  org_id: string
  actor_id: string
  actor_role: string
  actor_email: string
  action: AuditAction
  resource_type: ResourceType
  resource_id: string | null
  target_user_id: string | null
  target_course_id: string | null
  request_ip: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  occurred_at: string
  archived_at: string | null
  retention_class: RetentionClass
}

/**
 * Application input shape for writing an immutable report audit entry.
 * Uses camelCase at the TypeScript boundary and maps to `report_audit_log`.
 */
export interface AuditEntry {
  orgId: string
  actorId: string
  actorRole: string
  actorEmail: string
  action: AuditAction
  resourceType: ResourceType
  resourceId: string | null
  targetUserId: string | null
  targetCourseId: string | null
  metadata: Record<string, unknown>
  retentionClass?: RetentionClass
}

/**
 * Student progress payload consumed by PDF/report templates.
 */
export interface StudentReportData {
  studentId: string
  studentName: string
  studentEmail: string
  orgId: string
  generatedAt: string
  courses: Array<{
    courseId: string
    courseTitle: string
    enrollmentStatus: string
    progressPercent: number
    averageGrade: number | null
    letterGrade: string | null
    completedAt: string | null
    certificateNo: string | null
  }>
}

/**
 * Gradebook payload consumed by PDF/report templates.
 */
export interface GradebookReportData {
  orgId: string
  courseId: string
  courseTitle: string
  instructorName: string | null
  generatedAt: string
  students: Array<{
    studentId: string
    studentName: string
    studentEmail: string
    totalSubmissions: number
    gradedSubmissions: number
    averageGrade: number | null
    lastSubmissionAt: string | null
  }>
}

/**
 * Course completion aggregate row.
 * Matches the `mv_course_completion_rates` materialized view output.
 */
export interface CourseCompletionRate {
  org_id: string
  course_id: string
  course_title: string
  enrolled_count: number
  completed_count: number
  completion_rate_pct: number
  refreshed_at: string
}

/**
 * Gradebook aggregate row.
 * Matches the `mv_gradebook_summary` materialized view output.
 */
export interface GradebookSummary {
  org_id: string
  course_id: string
  user_id: string
  student_name: string
  total_submissions: number
  avg_grade: number | null
  last_submission_at: string | null
}
