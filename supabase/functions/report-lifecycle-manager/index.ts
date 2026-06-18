import { createClient } from 'jsr:@supabase/supabase-js@2'

const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-000000000001'
const BATCH_SIZE = 100
const REPORTS_BUCKET = 'reports'
const ARCHIVE_BUCKET = 'system-archives'

type LifecycleResults = {
  archivedArtifacts: number
  deletedArtifacts: number
  archivedAuditRows: number
  refreshedViews: boolean
  errors: Array<{ step: string; id?: string; message: string }>
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Missing Supabase service configuration' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const results: LifecycleResults = {
    archivedArtifacts: 0,
    deletedArtifacts: 0,
    archivedAuditRows: 0,
    refreshedViews: false,
    errors: [],
  }

  // Step 1: Archive non-FERPA artifacts older than 30 days into cold/ storage.
  const { data: archiveCandidates, error: archiveQueryError } = await supabase
    .from('report_artifacts')
    .select('id, storage_path, org_id, generated_by')
    .neq('retention_class', 'ferpa')
    .is('archive_storage_path', null)
    .not('storage_path', 'is', null)
    .lt('generated_at', daysAgo(30))
    .limit(BATCH_SIZE)

  if (archiveQueryError) {
    results.errors.push({ step: 'archive-artifacts-query', message: archiveQueryError.message })
  }

  for (const artifact of archiveCandidates ?? []) {
    try {
      const sourcePath = artifact.storage_path as string
      const archivePath = `cold/${sourcePath.replace(/^\/+/, '')}`
      const { error: moveError } = await supabase.storage
        .from(REPORTS_BUCKET)
        .move(sourcePath, archivePath)
      if (moveError) throw moveError

      const { error: updateError } = await supabase
        .from('report_artifacts')
        .update({
          archive_storage_path: archivePath,
          archived_at: new Date().toISOString(),
        })
        .eq('id', artifact.id)
      if (updateError) throw updateError

      results.archivedArtifacts += 1
    } catch (error) {
      results.errors.push({
        step: 'archive-artifact',
        id: artifact.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Step 2: Hard delete non-FERPA artifacts older than 90 days and write final audit rows.
  const { data: deleteCandidates, error: deleteQueryError } = await supabase
    .from('report_artifacts')
    .select('id, storage_path, archive_storage_path, org_id')
    .neq('retention_class', 'ferpa')
    .lt('generated_at', daysAgo(90))
    .limit(BATCH_SIZE)

  if (deleteQueryError) {
    results.errors.push({ step: 'delete-artifacts-query', message: deleteQueryError.message })
  }

  for (const artifact of deleteCandidates ?? []) {
    try {
      const paths = [artifact.archive_storage_path, artifact.storage_path].filter(Boolean) as string[]
      if (paths.length > 0) {
        const { error: removeError } = await supabase.storage.from(REPORTS_BUCKET).remove(paths)
        if (removeError) throw removeError
      }

      await supabase.from('report_audit_log').insert({
        org_id: artifact.org_id,
        actor_id: SYSTEM_ACTOR_ID,
        actor_role: 'system',
        actor_email: 'system@churchcore.local',
        action: 'report_artifact_expired',
        resource_type: 'report_artifact',
        resource_id: artifact.id,
        metadata: { lifecycle: 'hard_delete' },
        retention_class: 'standard',
      })

      const { error: deleteError } = await supabase.from('report_artifacts').delete().eq('id', artifact.id)
      if (deleteError) throw deleteError

      results.deletedArtifacts += 1
    } catch (error) {
      results.errors.push({
        step: 'delete-artifact',
        id: artifact.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Step 3: Archive standard audit rows older than 365 days to JSONL.
  const { data: auditRows, error: auditQueryError } = await supabase
    .from('report_audit_log')
    .select('*')
    .eq('retention_class', 'standard')
    .lt('occurred_at', daysAgo(365))
    .limit(BATCH_SIZE)

  if (auditQueryError) {
    results.errors.push({ step: 'archive-audit-query', message: auditQueryError.message })
  } else if ((auditRows ?? []).length > 0) {
    try {
      const archivePath = `report-audit/${new Date().toISOString()}.jsonl`
      const body = (auditRows ?? []).map((row) => JSON.stringify(row)).join('\n') + '\n'
      const { error: uploadError } = await supabase.storage
        .from(ARCHIVE_BUCKET)
        .upload(archivePath, body, {
          contentType: 'application/x-ndjson',
          upsert: false,
        })
      if (uploadError) throw uploadError
      results.archivedAuditRows = auditRows?.length ?? 0
    } catch (error) {
      results.errors.push({
        step: 'archive-audit-upload',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Step 4: Refresh reporting materialized views for dashboard freshness.
  const { error: refreshError } = await supabase.rpc('refresh_report_materialized_views')
  if (refreshError) {
    results.errors.push({ step: 'refresh-report-views', message: refreshError.message })
  } else {
    results.refreshedViews = true
  }

  console.log(JSON.stringify({ event: 'report_lifecycle_manager_complete', results }))
  return json(results, results.errors.length > 0 ? 207 : 200)
})
