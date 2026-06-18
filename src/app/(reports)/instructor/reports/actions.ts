'use server'

import { createServerClient } from '@/lib/supabase/server'
import { getGradebookSummary } from '@/lib/reporting/report-aggregates'
import { writeAuditLog } from '@/lib/reporting/audit-logger'
import { createReportArtifact } from '@/lib/reporting/report-queries'
import {
  estimateReportPages,
  generateGradebookPDF,
  generateGradebookXLSX,
} from '@/lib/reporting/export-handlers'
import type { GradebookReportData } from '@/types/reporting'

type InstructorProfile = {
  uid: string
  role: string
  org_id: string
  email: string
  display_name: string | null
}

type CourseRow = {
  id: string
  title: string
  owner_id: string
  org_id: string
}

type ReportActionResult = {
  success: boolean
  artifactId?: string
  error?: string
  fileName?: string
  mimeType?: string
  base64?: string
}

async function getInstructorExportContext(courseId: string) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'You must be signed in to export gradebooks' }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('uid, role, org_id, email, display_name')
    .eq('auth_id', user.id)
    .single<InstructorProfile & { org_id: string | null }>()

  if (profileError || !profile) return { error: 'Profile not found' }
  if (!['admin', 'teacher', 'instructor'].includes(profile.role)) {
    return { error: 'Only instructors and admins can export gradebooks' }
  }
  if (!profile.org_id) return { error: 'Profile is missing an organization' }

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, title, owner_id, org_id')
    .eq('id', courseId)
    .eq('org_id', profile.org_id)
    .single<CourseRow>()

  if (courseError || !course) return { error: 'Course not found' }
  if (profile.role !== 'admin' && course.owner_id !== profile.uid) {
    return { error: 'You do not teach this course' }
  }

  return { supabase, profile: { ...profile, org_id: profile.org_id } as InstructorProfile, course }
}

function toGradebookReportData(
  profile: InstructorProfile,
  course: CourseRow,
  rows: Awaited<ReturnType<typeof getGradebookSummary>>
): GradebookReportData {
  return {
    orgId: course.org_id,
    courseId: course.id,
    courseTitle: course.title,
    instructorName: profile.display_name,
    generatedAt: new Date().toISOString(),
    students: rows.map((row) => ({
      studentId: row.user_id,
      studentName: row.student_name,
      studentEmail: '',
      totalSubmissions: row.total_submissions,
      gradedSubmissions: row.avg_grade === null ? 0 : row.total_submissions,
      averageGrade: row.avg_grade,
      lastSubmissionAt: row.last_submission_at,
    })),
  }
}

export async function generateGradebookPDFExport(courseId: string): Promise<ReportActionResult> {
  const context = await getInstructorExportContext(courseId)
  if ('error' in context) return { success: false, error: context.error }

  const { supabase, profile, course } = context

  try {
    const rows = await getGradebookSummary(profile.org_id, course.id)
    const pageCount = estimateReportPages(rows.length)

    if (pageCount > 10) {
      const artifact = await createReportArtifact({
        report_definition_id: null,
        org_id: profile.org_id,
        generated_by: profile.uid,
        format: 'pdf',
        storage_path: null,
        archive_storage_path: null,
        signed_url: null,
        signed_url_expires: null,
        row_count: rows.length,
        generation_status: 'pending',
        error_message: null,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        archived_at: null,
        retention_class: 'ferpa',
      })

      await supabase.functions.invoke('generate-gradebook-report', {
        body: { artifactId: artifact.id, courseId: course.id, format: 'pdf' },
      })
      await writeAuditLog({
        orgId: profile.org_id,
        actorId: profile.uid,
        actorRole: profile.role,
        actorEmail: profile.email,
        action: 'report_exported_pdf',
        resourceType: 'report_artifact',
        resourceId: artifact.id,
        targetUserId: null,
        targetCourseId: course.id,
        metadata: { async: true, format: 'pdf' },
        retentionClass: 'ferpa',
      })
      return { success: true, artifactId: artifact.id }
    }

    const pdf = await generateGradebookPDF(toGradebookReportData(profile, course, rows))
    await writeAuditLog({
      orgId: profile.org_id,
      actorId: profile.uid,
      actorRole: profile.role,
      actorEmail: profile.email,
      action: 'report_exported_pdf',
      resourceType: 'analytics_dashboard',
      resourceId: null,
      targetUserId: null,
      targetCourseId: course.id,
      metadata: { async: false, format: 'pdf' },
      retentionClass: 'ferpa',
    })

    return {
      success: true,
      fileName: 'gradebook.pdf',
      mimeType: 'application/pdf',
      base64: pdf.toString('base64'),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export gradebook PDF'
    await writeAuditLog({
      orgId: profile.org_id,
      actorId: profile.uid,
      actorRole: profile.role,
      actorEmail: profile.email,
      action: 'report_exported_pdf',
      resourceType: 'analytics_dashboard',
      resourceId: null,
      targetUserId: null,
      targetCourseId: course.id,
      metadata: { error: message, format: 'pdf' },
      retentionClass: 'ferpa',
    })
    return { success: false, error: message }
  }
}

export async function generateGradebookXLSXExport(courseId: string): Promise<ReportActionResult> {
  const context = await getInstructorExportContext(courseId)
  if ('error' in context) return { success: false, error: context.error }

  const { profile, course } = context

  try {
    const rows = await getGradebookSummary(profile.org_id, course.id)
    const workbook = await generateGradebookXLSX(rows)
    await writeAuditLog({
      orgId: profile.org_id,
      actorId: profile.uid,
      actorRole: profile.role,
      actorEmail: profile.email,
      action: 'report_exported_xlsx',
      resourceType: 'analytics_dashboard',
      resourceId: null,
      targetUserId: null,
      targetCourseId: course.id,
      metadata: { async: false, format: 'xlsx' },
      retentionClass: 'ferpa',
    })

    return {
      success: true,
      fileName: 'gradebook.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: workbook.toString('base64'),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export gradebook spreadsheet'
    await writeAuditLog({
      orgId: profile.org_id,
      actorId: profile.uid,
      actorRole: profile.role,
      actorEmail: profile.email,
      action: 'report_exported_xlsx',
      resourceType: 'analytics_dashboard',
      resourceId: null,
      targetUserId: null,
      targetCourseId: course.id,
      metadata: { error: message, format: 'xlsx' },
      retentionClass: 'ferpa',
    })
    return { success: false, error: message }
  }
}
