import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  buildSignedDeliveryMessage,
  parseSignedDeliveryHeaders,
  verifySignedDelivery,
} from '@/lib/oneroster/signature'
import { validateAndStageOneRosterPackage } from '@/lib/oneroster/stage'
import { createServiceClient } from '@/utils/supabase/service'

export const runtime = 'nodejs'

const MAX_PACKAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const service = createServiceClient()
  const { data: connection, error: connectionError } = await service
    .from('oneroster_connections')
    .select('id, org_id, enabled, status, transport, source_system, source_tenant_id, schedule_interval_minutes, signature_key_id, signature_public_key')
    .eq('id', id)
    .maybeSingle()

  if (connectionError || !connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }
  if (!connection.enabled || connection.status !== 'active' || connection.transport !== 'signed_push') {
    return NextResponse.json({ error: 'Connection is not accepting deliveries' }, { status: 409 })
  }

  const parsedHeaders = parseSignedDeliveryHeaders(req.headers)
  if (!parsedHeaders.ok) {
    return NextResponse.json({ error: parsedHeaders.code }, { status: 401 })
  }
  if (parsedHeaders.value.keyId !== connection.signature_key_id) {
    return NextResponse.json({ error: 'unknown_key' }, { status: 401 })
  }

  const contentType = req.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (!contentType || !ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 })
  }
  const contentLength = Number(req.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_PACKAGE_BYTES) {
    return NextResponse.json({ error: 'package_too_large' }, { status: 413 })
  }

  let buffer: ArrayBuffer
  try {
    buffer = await req.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'invalid_package' }, { status: 400 })
  }
  if (buffer.byteLength === 0) return NextResponse.json({ error: 'empty_package' }, { status: 400 })
  if (buffer.byteLength > MAX_PACKAGE_BYTES) {
    return NextResponse.json({ error: 'package_too_large' }, { status: 413 })
  }

  const packageHash = createHash('sha256').update(Buffer.from(buffer)).digest('hex')
  const message = buildSignedDeliveryMessage({
    connectionId: connection.id,
    deliveryId: parsedHeaders.value.deliveryId,
    deliveredAt: parsedHeaders.value.deliveredAt,
    packageHash,
  })
  if (!connection.signature_public_key || !verifySignedDelivery({
    publicKeyPem: connection.signature_public_key,
    signature: parsedHeaders.value.signature,
    message,
  })) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  const { data: replay, error: replayError } = await service
    .from('oneroster_transport_attempts')
    .select('id')
    .eq('connection_id', connection.id)
    .eq('delivery_id', parsedHeaders.value.deliveryId)
    .maybeSingle()
  if (replayError) return NextResponse.json({ error: 'delivery_check_failed' }, { status: 500 })
  if (replay) return NextResponse.json({ error: 'delivery_replayed' }, { status: 409 })

  const staging = await validateAndStageOneRosterPackage({
    buffer,
    connectionId: connection.id,
    orgId: connection.org_id,
    sourceSystem: connection.source_system,
    sourceTenantId: connection.source_tenant_id,
  })
  // Transient: another delivery of this package is mid-staging. Return before
  // recording an attempt so the sender can retry with the same delivery ID
  // (an attempt row would make that retry a 409 delivery_replayed).
  if (!staging.ok && staging.error === 'staging_in_progress') {
    return NextResponse.json({ error: staging.error }, { status: 409 })
  }

  // Validity wins over duplication: a redelivered invalid package is still
  // invalid, and must never be acknowledged (or advance last_success_at).
  const status = staging.ok
    ? !staging.valid ? 'invalid' : staging.duplicate ? 'duplicate' : 'validated'
    : 'failed'
  const validation = staging.ok ? staging.validation : undefined
  const errorCode = staging.ok ? (staging.valid ? null : 'package_invalid') : staging.error

  const { error: attemptError } = await service.from('oneroster_transport_attempts').insert({
    org_id: connection.org_id,
    connection_id: connection.id,
    delivery_id: parsedHeaders.value.deliveryId,
    job_id: staging.ok ? staging.jobId : null,
    package_hash: packageHash,
    status,
    error_code: errorCode,
    total_rows: validation?.preview.totalRows ?? 0,
    valid_rows: validation?.preview.validRows ?? 0,
    quarantined_rows: validation?.preview.quarantinedRows ?? 0,
    delivered_at: parsedHeaders.value.deliveredAt,
  })
  if (attemptError?.code === '23505') {
    return NextResponse.json({ error: 'delivery_replayed' }, { status: 409 })
  }
  if (attemptError) return NextResponse.json({ error: 'delivery_record_failed' }, { status: 500 })

  const now = new Date()
  const intervalMs = Number(connection.schedule_interval_minutes) * 60 * 1000
  const timestamps: Record<string, string> = {
    last_attempt_at: now.toISOString(),
    next_expected_at: new Date(now.getTime() + intervalMs).toISOString(),
  }
  if (status === 'validated' || status === 'duplicate') {
    timestamps.last_success_at = now.toISOString()
    timestamps.last_sync_at = now.toISOString()
  }
  await service.from('oneroster_connections').update(timestamps).eq('id', connection.id)

  if (!staging.ok) return NextResponse.json({ error: staging.error }, { status: 500 })
  return NextResponse.json({
    deliveryId: parsedHeaders.value.deliveryId,
    duplicate: staging.duplicate,
    jobId: staging.jobId,
    status,
    valid: staging.valid,
  }, { status: !staging.valid ? 422 : staging.duplicate ? 200 : 202 })
}
