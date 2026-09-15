import { NextRequest, NextResponse } from 'next/server'
import { previewOneRosterJob } from '@/lib/oneroster/apply'
import { getOneRosterAdminContext } from '@/lib/oneroster/admin-context'

export const runtime = 'nodejs'

interface StagedRowSummary {
  file_type: string
  row_number: number
  status: string
  error_code: string | null
  error_message: string | null
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getOneRosterAdminContext()
  if ('response' in context) return context.response

  const { id } = await params
  const { data: job, error: jobError } = await context.supabase
    .from('oneroster_import_jobs')
    .select('id, status, total_rows, quarantined_count')
    .eq('id', id)
    .eq('org_id', context.orgId)
    .single()

  if (jobError || !job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 })
  if (!['validated', 'ready'].includes(job.status)) {
    return NextResponse.json({ error: 'Import job is not ready for review' }, { status: 409 })
  }

  const rows: StagedRowSummary[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await context.supabase
      .from('oneroster_import_rows')
      .select('file_type, row_number, status, error_code, error_message')
      .eq('job_id', id)
      .eq('org_id', context.orgId)
      .order('row_number', { ascending: true })
      .range(offset, offset + 999)
    if (error) return NextResponse.json({ error: 'Unable to load staged rows' }, { status: 500 })
    rows.push(...((data ?? []) as StagedRowSummary[]))
    if (!data || data.length < 1000) break
  }

  const diff = await previewOneRosterJob({
    jobId: id,
    orgId: context.orgId,
    actorAuthId: context.authId,
    actorUid: context.profileUid,
  })
  if ('error' in diff) return NextResponse.json({ error: diff.error }, { status: 500 })

  const byFile: Record<string, { totalRows: number; validRows: number; quarantinedRows: number }> = {}
  for (const row of rows) {
    const counts = byFile[row.file_type] ?? { totalRows: 0, validRows: 0, quarantinedRows: 0 }
    counts.totalRows += 1
    if (row.status === 'quarantined') counts.quarantinedRows += 1
    else counts.validRows += 1
    byFile[row.file_type] = counts
  }

  return NextResponse.json({
    jobId: id,
    valid: true,
    preview: {
      totalRows: job.total_rows,
      validRows: job.total_rows - job.quarantined_count,
      quarantinedRows: job.quarantined_count,
      byFile,
    },
    diff,
    issues: rows
      .filter((row) => row.error_code)
      .map((row) => ({
        severity: 'error',
        code: row.error_code,
        message: row.error_message ?? 'Row failed validation.',
        fileType: row.file_type,
        rowNumber: row.row_number,
      })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
