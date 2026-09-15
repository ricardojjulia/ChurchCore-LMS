import { createPublicKey, verify } from 'node:crypto'

const DELIVERY_WINDOW_MS = 5 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KEY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{80,128}$/

export interface SignedDeliveryHeaders {
  deliveredAt: string
  deliveryId: string
  keyId: string
  signature: string
}

export type ParsedDeliveryHeaders =
  | { ok: true; value: SignedDeliveryHeaders }
  | { ok: false; code: 'missing_headers' | 'invalid_delivery_id' | 'invalid_timestamp' | 'stale_delivery' | 'invalid_key_id' | 'invalid_signature' }

export function parseSignedDeliveryHeaders(
  headers: Headers,
  nowMs = Date.now(),
): ParsedDeliveryHeaders {
  const deliveryId = headers.get('x-churchcore-delivery-id')?.trim()
  const deliveredAt = headers.get('x-churchcore-delivered-at')?.trim()
  const keyId = headers.get('x-churchcore-key-id')?.trim()
  const signature = headers.get('x-churchcore-signature')?.trim()

  if (!deliveryId || !deliveredAt || !keyId || !signature) {
    return { ok: false, code: 'missing_headers' }
  }
  if (!UUID_PATTERN.test(deliveryId)) return { ok: false, code: 'invalid_delivery_id' }

  const deliveredAtMs = Date.parse(deliveredAt)
  if (!Number.isFinite(deliveredAtMs)) return { ok: false, code: 'invalid_timestamp' }
  if (Math.abs(nowMs - deliveredAtMs) > DELIVERY_WINDOW_MS) {
    return { ok: false, code: 'stale_delivery' }
  }
  if (!KEY_ID_PATTERN.test(keyId)) return { ok: false, code: 'invalid_key_id' }
  if (!SIGNATURE_PATTERN.test(signature)) return { ok: false, code: 'invalid_signature' }

  return { ok: true, value: { deliveredAt, deliveryId, keyId, signature } }
}

export function buildSignedDeliveryMessage({
  connectionId,
  deliveryId,
  deliveredAt,
  packageHash,
}: {
  connectionId: string
  deliveryId: string
  deliveredAt: string
  packageHash: string
}) {
  return ['churchcore-oneroster-delivery-v1', connectionId, deliveryId, deliveredAt, packageHash].join('\n')
}

export function isValidEd25519PublicKey(publicKeyPem: string): boolean {
  try {
    return createPublicKey(publicKeyPem).asymmetricKeyType === 'ed25519'
  } catch {
    return false
  }
}

export function isValidDeliveryKeyId(keyId: string): boolean {
  return KEY_ID_PATTERN.test(keyId)
}

export function verifySignedDelivery({
  publicKeyPem,
  signature,
  message,
}: {
  publicKeyPem: string
  signature: string
  message: string
}): boolean {
  try {
    const publicKey = createPublicKey(publicKeyPem)
    if (publicKey.asymmetricKeyType !== 'ed25519') return false
    return verify(null, Buffer.from(message, 'utf8'), publicKey, Buffer.from(signature, 'base64url'))
  } catch {
    return false
  }
}
