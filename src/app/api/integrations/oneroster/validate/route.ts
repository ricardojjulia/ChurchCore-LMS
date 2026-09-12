import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { previewOneRosterJob, readOneRosterZip, validateOneRosterPackage } from '@/lib/oneroster'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  'multipart/x-zip',
])

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 })
  }

  if (!profile.org_id) {
    return NextResponse.json({ error: 'No organization associated with account' }, { status: 403 })
  }

  const { data: tenantActive, error: tenantError } = await supabase.rpc('current_user_tenant_active')
  if (tenantError || tenantActive !== true) {
    return NextResponse.json({ error: 'Organization is not active' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const hasZipName = file.name.toLowerCase().endsWith('.zip')
  if (!hasZipName && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'File must be a OneRoster ZIP package' }, { status: 415 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 })
  }

  const buffer = await file.arrayBuffer()
  const zipResult = await readOneRosterZip(buffer, { maxPackageBytes: MAX_BYTES })
  const validation = validateOneRosterPackage(zipResult.files)
  const issues = [...zipResult.issues, ...validation.issues].map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    fileType: issue.fileType,
    rowNumber: issue.rowNumber,
    sourcedIdHash: issue.sourcedIdHash,
  }))

  const valid = issues.every((issue) => issue.severity !== 'error')
  const staging = await stageValidationResult({
    orgId: profile.org_id,
    uploadedBy: profile.uid,
    packageHash: createHash('sha256').update(Buffer.from(buffer)).digest('hex'),
    validation,
    issues,
    valid,
  })

  if (!staging.ok) {
    return NextResponse.json({ error: 'Package validated but staging failed' }, { status: 500 })
  }

  const diff = valid
    ? await previewOneRosterJob({
        jobId: staging.jobId,
        orgId: profile.org_id,
        actorAuthId: user.id,
        actorUid: profile.uid,
      })
    : {
        created: 0,
        updated: 0,
        unchanged: validation.preview.validRows,
        deactivated: 0,
        quarantined: validation.preview.quarantinedRows,
      }

  if ('error' in diff) {
    return NextResponse.json({ error: diff.error }, { status: 500 })
  }

  return NextResponse.json({
    jobId: staging.jobId,
    valid,
    preview: validation.preview,
    diff,
    issues,
  })
}

async function stageValidationResult({
  orgId,
  uploadedBy,
  packageHash,
  validation,
  issues,
  valid,
}: {
  orgId: string
  uploadedBy: string
  packageHash: string
  validation: ReturnType<typeof validateOneRosterPackage>
  issues: Array<{
    severity: 'error' | 'warning'
    code: string
    message: string
    fileType?: string
    rowNumber?: number
    sourcedIdHash?: string
  }>
  valid: boolean
}): Promise<{ ok: true; jobId: string } | { ok: false }> {
  try {
    const service = createServiceClient()
    const errorIssues = issues.filter((issue) => issue.severity === 'error')
    const rowErrorKeys = new Set(
      errorIssues
        .filter((issue) => issue.fileType && issue.rowNumber)
        .map((issue) => `${issue.fileType}:${issue.rowNumber}`),
    )

    const { data: job, error: jobError } = await service
      .from('oneroster_import_jobs')
      .insert({
        org_id: orgId,
        status: 'validating',
        dry_run: true,
        package_hash: packageHash,
        uploaded_by: uploadedBy,
        total_rows: validation.preview.totalRows,
        quarantined_count: validation.preview.quarantinedRows,
        error_count: errorIssues.length,
        error_summary: summarizeErrors(errorIssues),
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (jobError || !job) return { ok: false }

    const rows = validation.files.flatMap((parsedFile) =>
      parsedFile.rows.map((row) => {
        const rowHasError = rowErrorKeys.has(`${row.fileType}:${row.rowNumber}`)
        return {
          org_id: orgId,
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
      const { error: rowsError } = await service.from('oneroster_import_rows').insert(rows.slice(offset, offset + 500))
      if (rowsError) {
        await service.from('oneroster_import_jobs').update({ status: 'failed' }).eq('id', job.id).eq('org_id', orgId)
        return { ok: false }
      }
    }

    const { error: readyError } = await service.from('oneroster_import_jobs')
      .update({ status: valid ? 'validated' : 'failed', completed_at: new Date().toISOString() })
      .eq('id', job.id).eq('org_id', orgId)
    if (readyError) return { ok: false }

    return { ok: true, jobId: job.id }
  } catch {
    return { ok: false }
  }
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
  for (const issue of issues) {
    byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1)
  }
  return {
    counts: Object.fromEntries(byCode.entries()),
    files: Array.from(new Set(issues.map((issue) => issue.fileType).filter(Boolean))),
  }
}
