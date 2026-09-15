import { NextRequest, NextResponse } from 'next/server'
import { getOneRosterAdminContext } from '@/lib/oneroster/admin-context'
import { isValidDeliveryKeyId, isValidEd25519PublicKey } from '@/lib/oneroster/signature'

export const runtime = 'nodejs'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET() {
  const context = await getOneRosterAdminContext()
  if ('response' in context) return context.response

  const { data: connection, error } = await context.supabase
    .from('oneroster_connections')
    .select('id, name, enabled, source_tenant_id, status, transport, schedule_interval_minutes, signature_algorithm, signature_key_id, signature_public_key, last_attempt_at, last_success_at, next_expected_at, updated_at')
    .eq('org_id', context.orgId)
    .eq('source_system', 'churchcore_academy')
    .eq('transport', 'signed_push')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Unable to load connection' }, { status: 500 })

  let attempts: unknown[] = []
  if (connection) {
    const { data, error: attemptsError } = await context.supabase
      .from('oneroster_transport_attempts')
      .select('id, delivery_id, job_id, status, error_code, total_rows, valid_rows, quarantined_rows, delivered_at, completed_at')
      .eq('org_id', context.orgId)
      .eq('connection_id', connection.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (attemptsError) return NextResponse.json({ error: 'Unable to load delivery history' }, { status: 500 })
    attempts = data ?? []
  }

  return NextResponse.json({
    connection: connection
      ? { ...connection, deliveryEndpoint: `/api/integrations/oneroster/connections/${connection.id}/deliveries` }
      : null,
    attempts,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(req: NextRequest) {
  const context = await getOneRosterAdminContext()
  if ('response' in context) return context.response

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const sourceTenantId = typeof body.sourceTenantId === 'string' ? body.sourceTenantId.trim() : ''
  const keyId = typeof body.keyId === 'string' ? body.keyId.trim() : ''
  const publicKey = typeof body.publicKey === 'string' ? body.publicKey.trim() : ''
  const interval = body.scheduleIntervalMinutes
  const enabled = body.enabled

  if ((id && !UUID_PATTERN.test(id)) || !name || name.length > 120) {
    return NextResponse.json({ error: 'A valid connection name is required' }, { status: 400 })
  }
  if (!sourceTenantId || sourceTenantId.length > 200) {
    return NextResponse.json({ error: 'A valid Academy tenant ID is required' }, { status: 400 })
  }
  if (!isValidDeliveryKeyId(keyId)) {
    return NextResponse.json({ error: 'A valid key ID is required' }, { status: 400 })
  }
  if (publicKey.length > 4096 || !isValidEd25519PublicKey(publicKey)) {
    return NextResponse.json({ error: 'A valid Ed25519 public key is required' }, { status: 400 })
  }
  if (!Number.isInteger(interval) || Number(interval) < 15 || Number(interval) > 10080) {
    return NextResponse.json({ error: 'Schedule interval must be between 15 and 10080 minutes' }, { status: 400 })
  }
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'Enabled must be true or false' }, { status: 400 })
  }

  const values = {
    org_id: context.orgId,
    name,
    mode: 'academy_csv',
    provider: 'churchcore_academy',
    enabled,
    source_system: 'churchcore_academy',
    source_tenant_id: sourceTenantId,
    status: enabled ? 'active' : 'inactive',
    sync_direction: 'inbound',
    transport: 'signed_push',
    schedule_interval_minutes: Number(interval),
    signature_algorithm: 'ed25519',
    signature_key_id: keyId,
    signature_public_key: publicKey,
  }

  const query = id
    ? context.supabase
        .from('oneroster_connections')
        .update(values)
        .eq('id', id)
        .eq('org_id', context.orgId)
    : context.supabase
        .from('oneroster_connections')
        .insert({ ...values, created_by: context.profileUid })

  const { data, error } = await query
    .select('id, name, enabled, source_tenant_id, status, transport, schedule_interval_minutes, signature_algorithm, signature_key_id, signature_public_key, last_attempt_at, last_success_at, next_expected_at, updated_at')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Connection could not be saved' }, { status: 400 })
  return NextResponse.json({
    connection: { ...data, deliveryEndpoint: `/api/integrations/oneroster/connections/${data.id}/deliveries` },
  })
}
