'use server'

import { createServerClient } from '@/lib/supabase/server'
import { buildStudentReportData } from '@/lib/reporting/report-aggregates'
import { writeAuditLog } from '@/lib/reporting/audit-logger'
import { createReportArtifact } from '@/lib/reporting/report-queries'
import {
  estimateReportPages,
  generateStudentPDF,
  generateStudentXLSX,
} from '@/lib/reporting/export-handlers'

type StudentProfile = {
  uid: string
  role: string
  org_id: string
  email: string
}

type ReportActionResult = {
  success: boolean
  artifactId?: string
  error?: string
  fileName?: string
  mimeType?: string
  base64?: string
}

async function getStudentExportContext() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'You must be signed in to export reports' }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('uid, role, org_id, email')
    .eq('auth_id', user.id)
    .single<StudentProfile & { org_id: string | null }>()

  if (error || !profile) return { error: 'Profile not found' }
  if (profile.role !== 'student') return { error: 'Only students can export this report' }
  if (!profile.org_id) return { error: 'Profile is missing an organization' }

  return { supabase, profile: { ...profile, org_id: profile.org_id } as StudentProfile }
}

export async function generateStudentProgressReport(courseId?: string): Promise<ReportActionResult> {
  const context = await getStudentExportContext()
  if ('error' in context) return { success: false, error: context.error }

  const { supabase, profile } = context

  try {
    const data = await buildStudentReportData(profile.uid, profile.org_id, courseId)
    const pageCount = estimateReportPages(data.courses.length)

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
        row_count: data.courses.length,
        generation_status: 'pending',
        error_message: null,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        archived_at: null,
        retention_class: 'ferpa',
      })

      await supabase.functions.invoke('generate-student-report', {
        body: { artifactId: artifact.id, courseId },
      })
      await writeAuditLog({
        orgId: profile.org_id,
        actorId: profile.uid,
        actorRole: profile.role,
        actorEmail: profile.email,
        action: 'student_self_export',
        resourceType: 'report_artifact',
        resourceId: artifact.id,
        targetUserId: profile.uid,
        targetCourseId: courseId ?? null,
        metadata: { async: true, format: 'pdf' },
        retentionClass: 'ferpa',
      })

      return { success: true, artifactId: artifact.id }
    }

    const pdf = await generateStudentPDF(data)
    await writeAuditLog({
      orgId: profile.org_id,
      actorId: profile.uid,
      actorRole: profile.role,
      actorEmail: profile.email,
      action: 'student_self_export',
      resourceType: 'analytics_dashboard',
      resourceId: null,
      targetUserId: profile.uid,
      targetCourseId: courseId ?? null,
      metadata: { async: false, format: 'pdf' },
      retentionClass: 'ferpa',
    })

    return {
      success: true,
      fileName: 'student-progress.pdf',
      mimeType: 'application/pdf',
      base64: pdf.toString('base64'),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export student report'
    await writeAuditLog({
      orgId: profile.org_id,
      actorId: profile.uid,
      actorRole: profile.role,
      actorEmail: profile.email,
      action: 'student_self_export',
      resourceType: 'analytics_dashboard',
      resourceId: null,
      targetUserId: profile.uid,
      targetCourseId: courseId ?? null,
      metadata: { error: message, format: 'pdf' },
      retentionClass: 'ferpa',
    })
    return { success: false, error: message }
  }
}

export async function generateStudentXLSXExport(courseId?: string): Promise<ReportActionResult> {
  const context = await getStudentExportContext()
  if ('error' in context) return { success: false, error: context.error }

  const { profile } = context

  try {
    const data = await buildStudentReportData(profile.uid, profile.org_id, courseId)
    const workbook = generateStudentXLSX(data)
    await writeAuditLog({
      orgId: profile.org_id,
      actorId: profile.uid,
      actorRole: profile.role,
      actorEmail: profile.email,
      action: 'student_self_export',
      resourceType: 'analytics_dashboard',
      resourceId: null,
      targetUserId: profile.uid,
      targetCourseId: courseId ?? null,
      metadata: { async: false, format: 'xlsx' },
      retentionClass: 'ferpa',
    })

    return {
      success: true,
      fileName: 'student-progress.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: workbook.toString('base64'),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export student spreadsheet'
    await writeAuditLog({
      orgId: profile.org_id,
      actorId: profile.uid,
      actorRole: profile.role,
      actorEmail: profile.email,
      action: 'student_self_export',
      resourceType: 'analytics_dashboard',
      resourceId: null,
      targetUserId: profile.uid,
      targetCourseId: courseId ?? null,
      metadata: { error: message, format: 'xlsx' },
      retentionClass: 'ferpa',
    })
    return { success: false, error: message }
  }
}
