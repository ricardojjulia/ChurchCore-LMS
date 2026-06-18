// Edge Function: system-health-check
// Runs a suite of database and infrastructure health checks and persists
// results to system_health_checks. Called by pg_cron or the admin UI.
//
// Environment variables required:
//   SUPABASE_URL               — project URL
//   SUPABASE_SERVICE_ROLE_KEY  — service role (reads/writes system tables)
//   OPENAI_API_KEY             — optional; absence is reported as a warning

import { createClient } from 'jsr:@supabase/supabase-js@2'

type CheckStatus = 'ok' | 'warning' | 'error' | 'unknown'

interface CheckResult {
  check_name: string
  status:     CheckStatus
  message:    string
  details?:   Record<string, unknown>
}

// ── Individual checks ─────────────────────────────────────────────────────────

async function checkProfileRoles(
  supabase: ReturnType<typeof createClient>,
): Promise<CheckResult> {
  try {
    const { error } = await supabase
      .from('profile_roles')
      .select('uid', { count: 'exact', head: true })

    if (error) {
      return { check_name: 'profile_roles_table', status: 'error', message: error.message }
    }
    return { check_name: 'profile_roles_table', status: 'ok', message: 'Table accessible' }
  } catch (e) {
    return { check_name: 'profile_roles_table', status: 'error', message: String(e) }
  }
}

async function checkStuckEmbeddingJobs(
  supabase: ReturnType<typeof createClient>,
): Promise<CheckResult> {
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 min ago
    const { count, error } = await supabase
      .from('embedding_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing')
      .lt('created_at', cutoff)

    if (error) {
      return { check_name: 'embedding_jobs_stuck', status: 'error', message: error.message }
    }

    const n = count ?? 0
    if (n > 0) {
      return {
        check_name: 'embedding_jobs_stuck',
        status:     'warning',
        message:    `${n} embedding job(s) stuck in processing for >30 min`,
        details:    { stuck_count: n },
      }
    }
    return { check_name: 'embedding_jobs_stuck', status: 'ok', message: 'No stuck jobs' }
  } catch (e) {
    return { check_name: 'embedding_jobs_stuck', status: 'error', message: String(e) }
  }
}

async function checkFailedEmbeddingJobs(
  supabase: ReturnType<typeof createClient>,
): Promise<CheckResult> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // last 24h
    const { count, error } = await supabase
      .from('embedding_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', since)

    if (error) {
      return { check_name: 'embedding_jobs_failed_24h', status: 'error', message: error.message }
    }

    const n = count ?? 0
    if (n >= 10) {
      return {
        check_name: 'embedding_jobs_failed_24h',
        status:     'error',
        message:    `${n} embedding jobs failed in the last 24 hours`,
        details:    { failed_count: n },
      }
    }
    if (n > 0) {
      return {
        check_name: 'embedding_jobs_failed_24h',
        status:     'warning',
        message:    `${n} embedding job(s) failed in the last 24 hours`,
        details:    { failed_count: n },
      }
    }
    return { check_name: 'embedding_jobs_failed_24h', status: 'ok', message: 'No failures in 24h' }
  } catch (e) {
    return { check_name: 'embedding_jobs_failed_24h', status: 'error', message: String(e) }
  }
}

async function checkOrphanedEnrollments(
  supabase: ReturnType<typeof createClient>,
): Promise<CheckResult> {
  try {
    // Students in active direct_enrollments without a course enrollment
    const { data, error } = await supabase.rpc('count_unsynced_bridge_enrollments')

    if (error) {
      // RPC may not exist yet — degrade gracefully
      return {
        check_name: 'orphaned_enrollments',
        status:     'unknown',
        message:    'count_unsynced_bridge_enrollments RPC not available',
      }
    }

    const n = Number(data ?? 0)
    if (n > 0) {
      return {
        check_name: 'orphaned_enrollments',
        status:     'warning',
        message:    `${n} active direct_enrollment(s) without a course enrollment`,
        details:    { count: n },
      }
    }
    return { check_name: 'orphaned_enrollments', status: 'ok', message: 'Bridge enrollments in sync' }
  } catch (e) {
    return { check_name: 'orphaned_enrollments', status: 'unknown', message: String(e) }
  }
}

function checkOpenAiKey(): CheckResult {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) {
    return {
      check_name: 'openai_api_key',
      status:     'warning',
      message:    'OPENAI_API_KEY is not configured — AI features disabled',
    }
  }
  return { check_name: 'openai_api_key', status: 'ok', message: 'Configured' }
}

async function checkRlsHelpers(
  supabase: ReturnType<typeof createClient>,
): Promise<CheckResult> {
  try {
    const { data, error } = await supabase.rpc('current_user_role')
    if (error) {
      return {
        check_name: 'rls_helper_functions',
        status:     'error',
        message:    `current_user_role() failed: ${error.message}`,
      }
    }
    return {
      check_name: 'rls_helper_functions',
      status:     'ok',
      message:    `current_user_role() returned: ${data ?? 'null'}`,
    }
  } catch (e) {
    return { check_name: 'rls_helper_functions', status: 'error', message: String(e) }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const SUPA_URL = Deno.env.get('SUPABASE_URL')
  const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!SUPA_URL || !SUPA_KEY) {
    return new Response('Missing Supabase configuration', { status: 500 })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  // Run all checks in parallel
  const results: CheckResult[] = await Promise.all([
    checkProfileRoles(supabase),
    checkStuckEmbeddingJobs(supabase),
    checkFailedEmbeddingJobs(supabase),
    checkOrphanedEnrollments(supabase),
    checkRlsHelpers(supabase),
    Promise.resolve(checkOpenAiKey()),
  ])

  const lastChecked = new Date().toISOString()

  // Persist results to system_health_checks (migration 046 column names)
  const rows = results.map((r) => ({
    check_name:   r.check_name,
    status:       r.status,
    message:      r.message,
    metadata:     r.details ?? {},
    action_url:   null,
    last_checked: lastChecked,
  }))

  const { error: insertErr } = await supabase
    .from('system_health_checks')
    .insert(rows)

  const overallStatus = results.some((r) => r.status === 'error')
    ? 'error'
    : results.some((r) => r.status === 'warning')
      ? 'warning'
      : 'ok'

  return new Response(
    JSON.stringify({
      ok:           overallStatus !== 'error',
      status:       overallStatus,
      results,
      persisted:    !insertErr,
      last_checked: lastChecked,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
