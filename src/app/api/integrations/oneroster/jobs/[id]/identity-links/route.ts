import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const context = await getAdminContext()
  if ('response' in context) return context.response

  const { id } = await params
  const { data: job, error: jobError } = await context.supabase
    .from('oneroster_import_jobs')
    .select('id, status, org_id, source_system, source_tenant_id')
    .eq('id', id)
    .eq('org_id', context.orgId)
    .single()

  if (jobError || !job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 })

  const [{ data: rows, error: rowsError }, { data: profiles, error: profilesError }, { data: links, error: linksError }] = await Promise.all([
    context.supabase
      .from('oneroster_import_rows')
      .select('sourced_id, normalized_payload, operation, status, error_code, error_message')
      .eq('job_id', id)
      .eq('org_id', context.orgId)
      .eq('file_type', 'users')
      .order('row_number', { ascending: true }),
    context.supabase
      .from('profiles')
      .select('uid, display_name, email, student_id, role, status')
      .eq('org_id', context.orgId)
      .neq('status', 'archived')
      .order('display_name', { ascending: true })
      .limit(200),
    context.supabase
      .from('external_entity_links')
      .select('sourced_id, local_id, source_status, source_tenant_id')
      .eq('org_id', context.orgId)
      .eq('source_system', job.source_system)
      .eq('object_type', 'user')
      .eq('local_table', 'profiles'),
  ])

  if (rowsError || profilesError || linksError) {
    return NextResponse.json({ error: 'Unable to load identity links' }, { status: 500 })
  }

  const linkedBySourceId = new Map(
    (links ?? [])
      .filter((link) => link.source_tenant_id === job.source_tenant_id)
      .map((link) => [link.sourced_id, link]),
  )
  return NextResponse.json({
    job: { id: job.id, status: job.status },
    users: (rows ?? []).map((row) => ({
      sourcedId: row.sourced_id,
      status: row.normalized_payload?.status ?? null,
      enabledUser: row.normalized_payload?.enabledUser ?? null,
      operation: row.operation,
      rowStatus: row.status,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      linkedProfileUid: linkedBySourceId.get(row.sourced_id)?.local_id ?? null,
      sourceStatus: linkedBySourceId.get(row.sourced_id)?.source_status ?? null,
    })),
    profiles: profiles ?? [],
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const context = await getAdminContext()
  if ('response' in context) return context.response

  const { id } = await params
  let body: { sourcedId?: unknown; profileUid?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.sourcedId !== 'string' || !body.sourcedId.trim()
    || typeof body.profileUid !== 'string' || !body.profileUid.trim()) {
    return NextResponse.json({ error: 'Roster sourcedId and LMS profile are required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service.rpc('link_oneroster_user', {
    p_job_id: id,
    p_org_id: context.orgId,
    p_sourced_id: body.sourcedId.trim(),
    p_profile_uid: body.profileUid.trim(),
    p_actor_auth_id: context.authId,
    p_actor_uid: context.profileUid,
  })

  if (error) return NextResponse.json({ error: 'Identity link could not be saved' }, { status: 500 })
  if (!data || 'error' in data) return NextResponse.json({ error: data?.error ?? 'Identity link could not be saved' }, { status: 400 })

  const { data: preview, error: previewError } = await service.rpc('preview_oneroster_job', {
    p_job_id: id,
    p_org_id: context.orgId,
    p_actor_auth_id: context.authId,
    p_actor_uid: context.profileUid,
  })
  if (previewError || !preview || 'error' in preview) {
    return NextResponse.json(data)
  }
  return NextResponse.json({ ...data, preview })
}

type AdminContext =
  | { response: NextResponse }
  | { supabase: Awaited<ReturnType<typeof createClient>>; orgId: string; profileUid: string; authId: string }

async function getAdminContext(): Promise<AdminContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role) || !profile.org_id) {
    return { response: NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 }) }
  }

  const { data: tenantActive, error: tenantError } = await supabase.rpc('current_user_tenant_active')
  if (tenantError || tenantActive !== true) {
    return { response: NextResponse.json({ error: 'Organization is not active' }, { status: 403 }) }
  }

  return { supabase, orgId: profile.org_id, profileUid: profile.uid, authId: user.id }
}
