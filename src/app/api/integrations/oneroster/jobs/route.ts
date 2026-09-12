import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role) || !profile.org_id) {
    return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('oneroster_import_jobs')
    .select('id, status, total_rows, created_count, updated_count, unchanged_count, deactivated_count, quarantined_count, error_count, created_at, completed_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: 'Unable to load import history' }, { status: 500 })
  const jobs = (data ?? []).map((job) => ({
    id: job.id,
    status: job.status,
    total_rows: job.total_rows,
    error_count: job.error_count,
    created_at: job.created_at,
    completed_at: job.completed_at,
    created: job.created_count,
    updated: job.updated_count,
    unchanged: job.unchanged_count,
    deactivated: job.deactivated_count,
    quarantined: job.quarantined_count,
  }))
  return NextResponse.json({ jobs }, { headers: { 'Cache-Control': 'no-store' } })
}
