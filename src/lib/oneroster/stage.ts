import { createHash } from 'node:crypto'
import { createServiceClient } from '@/utils/supabase/service'
import { readOneRosterZip } from './zip'
import { validateOneRosterPackage } from './validate'
import type { OneRosterIssue, OneRosterValidationResult } from './types'

const MAX_PACKAGE_BYTES = 10 * 1024 * 1024

interface StagePackageOptions {
  buffer: ArrayBuffer
  connectionId?: string
  orgId: string
  sourceSystem?: string
  sourceTenantId?: string | null
  uploadedBy?: string | null
}

export type SafeOneRosterIssue = Omit<OneRosterIssue, 'sourcedId'>

export type StagePackageResult =
  | {
      ok: true
      duplicate: boolean
      jobId: string
      packageHash: string
      valid: boolean
      validation?: OneRosterValidationResult
      issues?: SafeOneRosterIssue[]
    }
  | { ok: false; error: 'staging_failed' }

export async function validateAndStageOneRosterPackage(
  options: StagePackageOptions,
): Promise<StagePackageResult> {
  try {
    return await stagePackage(options)
  } catch {
    return { ok: false, error: 'staging_failed' }
  }
}

async function stagePackage(options: StagePackageOptions): Promise<StagePackageResult> {
  const service = createServiceClient()
  const packageHash = createHash('sha256').update(Buffer.from(options.buffer)).digest('hex')

  if (options.connectionId) {
    const { data: existing, error } = await service
      .from('oneroster_import_jobs')
      .select('id, status')
      .eq('connection_id', options.connectionId)
      .eq('org_id', options.orgId)
      .eq('package_hash', packageHash)
      .maybeSingle()
    if (error) return { ok: false, error: 'staging_failed' }
    if (existing) {
      return {
        ok: true,
        duplicate: true,
        jobId: existing.id,
        packageHash,
        valid: existing.status !== 'failed',
      }
    }
  }

  const zipResult = await readOneRosterZip(options.buffer, { maxPackageBytes: MAX_PACKAGE_BYTES })
  const validation = validateOneRosterPackage(zipResult.files)
  const issues: SafeOneRosterIssue[] = [...zipResult.issues, ...validation.issues].map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    fileType: issue.fileType,
    rowNumber: issue.rowNumber,
    sourcedIdHash: issue.sourcedIdHash,
  }))
  const valid = issues.every((issue) => issue.severity !== 'error')
  const errorIssues = issues.filter((issue) => issue.severity === 'error')
  const rowErrorKeys = new Set(
    errorIssues
      .filter((issue) => issue.fileType && issue.rowNumber)
      .map((issue) => `${issue.fileType}:${issue.rowNumber}`),
  )

  const { data: job, error: jobError } = await service
    .from('oneroster_import_jobs')
    .insert({
      org_id: options.orgId,
      connection_id: options.connectionId ?? null,
      status: 'validating',
      dry_run: true,
      package_hash: packageHash,
      uploaded_by: options.uploadedBy ?? null,
      source_system: options.sourceSystem ?? 'manual',
      source_tenant_id: options.sourceTenantId ?? null,
      total_rows: validation.preview.totalRows,
      quarantined_count: validation.preview.quarantinedRows,
      error_count: errorIssues.length,
      error_summary: summarizeErrors(errorIssues),
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (jobError || !job) {
    if (jobError?.code === '23505' && options.connectionId) {
      const { data: existing, error: existingError } = await service
        .from('oneroster_import_jobs')
        .select('id, status')
        .eq('connection_id', options.connectionId)
        .eq('org_id', options.orgId)
        .eq('package_hash', packageHash)
        .maybeSingle()
      if (!existingError && existing) {
        return {
          ok: true,
          duplicate: true,
          jobId: existing.id,
          packageHash,
          valid: existing.status !== 'failed',
        }
      }
    }
    return { ok: false, error: 'staging_failed' }
  }

  const rows = validation.files.flatMap((parsedFile) =>
    parsedFile.rows.map((row) => {
      const rowHasError = rowErrorKeys.has(`${row.fileType}:${row.rowNumber}`)
      return {
        org_id: options.orgId,
        job_id: job.id,
        file_type: row.fileType,
        row_number: row.rowNumber,
        sourced_id: row.sourcedId ?? null,
        sourced_id_hash: row.sourcedIdHash ?? null,
        object_type: fileTypeToObjectType(row.fileType),
        operation: rowHasError ? 'quarantine' : 'none',
        status: rowHasError ? 'quarantined' : 'valid',
        normalized_payload: row.data,
        error_code: rowHasError ? 'row_validation_failed' : null,
        error_message: rowHasError ? 'Row failed validation.' : null,
      }
    }),
  )

  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error } = await service.from('oneroster_import_rows').insert(rows.slice(offset, offset + 500))
    if (error) {
      await markJobFailed(service, job.id, options.orgId)
      return { ok: false, error: 'staging_failed' }
    }
  }

  const { error: readyError } = await service
    .from('oneroster_import_jobs')
    .update({ status: valid ? 'validated' : 'failed', completed_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('org_id', options.orgId)
  if (readyError) return { ok: false, error: 'staging_failed' }

  return { ok: true, duplicate: false, jobId: job.id, packageHash, valid, validation, issues }
}

async function markJobFailed(
  service: ReturnType<typeof createServiceClient>,
  jobId: string,
  orgId: string,
) {
  await service
    .from('oneroster_import_jobs')
    .update({ status: 'failed', completed_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('org_id', orgId)
}

function fileTypeToObjectType(fileType: string): string | null {
  switch (fileType) {
    case 'orgs': return 'org'
    case 'users': return 'user'
    case 'roles': return 'role'
    case 'academicSessions': return 'academic_session'
    case 'courses': return 'course'
    case 'classes': return 'class'
    case 'enrollments': return 'enrollment'
    default: return null
  }
}

function summarizeErrors(issues: Array<{ code: string; fileType?: string; rowNumber?: number }>) {
  const byCode = new Map<string, number>()
  for (const issue of issues) byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1)
  return {
    counts: Object.fromEntries(byCode.entries()),
    files: Array.from(new Set(issues.map((issue) => issue.fileType).filter(Boolean))),
  }
}
