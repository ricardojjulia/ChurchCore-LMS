import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createHash } from 'node:crypto'
import {
  parseSignedDeliveryHeaders,
  buildSignedDeliveryMessage,
  verifySignedDelivery,
  validateAndSanitizeInboundPayload,
  computeStagingDiff,
  applyChurchCoreDelivery,
} from '@/lib/churchcore-connect'

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const parsedHeaders = parseSignedDeliveryHeaders(req.headers)

    if (!parsedHeaders.ok) {
      return NextResponse.json({ error: parsedHeaders.code }, { status: 401 })
    }

    const { deliveryId, deliveredAt, keyId, signature } = parsedHeaders.value

    const supabase = await createClient()

    // Find connection matching their_key_id
    const { data: connection, error: connErr } = await supabase
      .from('churchcore_connections')
      .select('*')
      .eq('their_key_id', keyId)
      .eq('status', 'connected')
      .maybeSingle()

    if (connErr || !connection) {
      return NextResponse.json({ error: 'invalid_key_or_unregistered_connection' }, { status: 401 })
    }

    // Hash payload and verify signature
    const payloadHash = createHash('sha256').update(rawBody).digest('hex')
    const message = buildSignedDeliveryMessage({
      connectionId: connection.id,
      deliveryId,
      deliveredAt,
      payloadHash,
    })

    const isValid = verifySignedDelivery({
      publicKeyPem: connection.their_public_key,
      signature,
      message,
    })

    if (!isValid) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
    }

    // Check delivery ID idempotency
    const { data: existingDelivery } = await supabase
      .from('churchcore_deliveries')
      .select('id, status')
      .eq('delivery_id', deliveryId)
      .maybeSingle()

    if (existingDelivery) {
      return NextResponse.json({ error: 'delivery_already_received', status: existingDelivery.status }, { status: 409 })
    }

    // Parse JSON and validate against schema & security rules
    let rawJson: unknown
    try {
      rawJson = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'invalid_json_payload' }, { status: 400 })
    }

    const validation = validateAndSanitizeInboundPayload(rawJson)
    if (!validation.valid || !validation.sanitizedPayload) {
      return NextResponse.json({ error: 'payload_validation_failed', details: validation.errors }, { status: 400 })
    }

    const payload = validation.sanitizedPayload

    // Fetch existing LMS context for diffing
    const { data: existingLinks } = await supabase
      .from('external_entity_links')
      .select('external_id, internal_id')
      .eq('org_id', connection.org_id)
      .eq('source_system', 'churchcore')

    const { data: existingProfiles } = await supabase
      .from('profiles')
      .select('uid, email, full_name, profile_roles(role)')
      .eq('org_id', connection.org_id)

    const { data: existingCohorts } = await supabase
      .from('external_entity_links')
      .select('external_id')
      .eq('org_id', connection.org_id)
      .eq('source_system', 'churchcore')
      .eq('object_type', 'group')

    const profilesByExternalId = new Map<string, any>()
    const profilesByEmail = new Map<string, any>()

    const linkMap = new Map((existingLinks || []).map(l => [l.external_id, l.internal_id]))

    for (const p of existingProfiles || []) {
      const role = (p.profile_roles?.[0] as any)?.role || 'student'
      if (p.email) profilesByEmail.set(p.email.toLowerCase(), { uid: p.uid, email: p.email, role, full_name: p.full_name })
    }

    for (const [extId, intId] of linkMap.entries()) {
      const p = (existingProfiles || []).find(prof => prof.uid === intId)
      if (p) {
        const role = (p.profile_roles?.[0] as any)?.role || 'student'
        profilesByExternalId.set(extId, { uid: p.uid, email: p.email, role, full_name: p.full_name })
      }
    }

    const cohortExtIds = new Set((existingCohorts || []).map(c => c.external_id))

    const diff = computeStagingDiff(payload, {
      profilesByExternalId,
      profilesByEmail,
      existingCohortExternalIds: cohortExtIds,
    })

    // Stage delivery
    const { data: staged, error: stageErr } = await supabase
      .from('churchcore_deliveries')
      .insert({
        org_id: connection.org_id,
        connection_id: connection.id,
        delivery_id: deliveryId,
        version: payload.version,
        payload_type: payload.type,
        payload,
        status: 'staged',
        stats: diff.summary,
      })
      .select('id')
      .single()

    if (stageErr || !staged) {
      return NextResponse.json({ error: 'failed_to_stage_delivery' }, { status: 500 })
    }

    // If auto_apply enabled and diff can be auto-applied safely
    let autoApplied = false
    if (connection.auto_apply && diff.summary.can_auto_apply) {
      const applyResult = await applyChurchCoreDelivery(supabase, {
        deliveryId: staged.id,
        orgId: connection.org_id,
        connectionId: connection.id,
        adminUid: connection.created_by,
        payload,
      })
      autoApplied = applyResult.success
    }

    return NextResponse.json(
      {
        message: 'Delivery accepted',
        delivery_id: deliveryId,
        staged_id: staged.id,
        status: autoApplied ? 'applied' : 'staged',
        stats: diff.summary,
      },
      { status: 202 }
    )
  } catch (err: any) {
    console.error('Error handling churchcore delivery:', err)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}
