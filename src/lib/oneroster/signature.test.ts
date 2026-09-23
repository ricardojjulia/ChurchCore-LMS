import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildSignedDeliveryMessage,
  isValidEd25519PublicKey,
  parseSignedDeliveryHeaders,
  verifySignedDelivery,
} from './signature'

const DELIVERY_ID = '11111111-1111-4111-8111-111111111111'
const DELIVERED_AT = '2026-09-14T16:00:00.000Z'
const NOW = Date.parse(DELIVERED_AT)

describe('signed OneRoster delivery', () => {
  it('verifies the versioned Ed25519 message', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const message = buildSignedDeliveryMessage({
      connectionId: 'connection-1',
      deliveryId: DELIVERY_ID,
      deliveredAt: DELIVERED_AT,
      packageHash: 'a'.repeat(64),
    })
    const signature = sign(null, Buffer.from(message), privateKey).toString('base64url')
    const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString()

    expect(isValidEd25519PublicKey(publicKeyPem)).toBe(true)
    expect(verifySignedDelivery({ publicKeyPem, signature, message })).toBe(true)
    expect(verifySignedDelivery({ publicKeyPem, signature, message: `${message}x` })).toBe(false)
  })

  it('rejects non-Ed25519 public keys', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    expect(isValidEd25519PublicKey(publicKey.export({ format: 'pem', type: 'spki' }).toString())).toBe(false)
  })

  it('rejects Ed25519 private keys even though their public half is derivable', () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    expect(isValidEd25519PublicKey(privateKey.export({ format: 'pem', type: 'pkcs8' }).toString())).toBe(false)
  })

  it('parses complete headers inside the clock window', () => {
    const headers = new Headers({
      'x-churchcore-delivery-id': DELIVERY_ID,
      'x-churchcore-delivered-at': DELIVERED_AT,
      'x-churchcore-key-id': 'academy-key-2026-01',
      'x-churchcore-signature': 'A'.repeat(86),
    })
    expect(parseSignedDeliveryHeaders(headers, NOW)).toMatchObject({
      ok: true,
      value: { deliveryId: DELIVERY_ID, keyId: 'academy-key-2026-01' },
    })
  })

  it.each([
    [{}, 'missing_headers'],
    [{ 'x-churchcore-delivery-id': 'not-a-uuid' }, 'missing_headers'],
    [{ 'x-churchcore-delivered-at': 'not-a-date' }, 'missing_headers'],
  ])('rejects incomplete headers %#', (partial, code) => {
    const headers = new Headers(partial)
    expect(parseSignedDeliveryHeaders(headers, NOW)).toEqual({ ok: false, code })
  })

  it('rejects stale deliveries', () => {
    const headers = new Headers({
      'x-churchcore-delivery-id': DELIVERY_ID,
      'x-churchcore-delivered-at': '2026-09-14T15:54:59.000Z',
      'x-churchcore-key-id': 'academy-key',
      'x-churchcore-signature': 'A'.repeat(86),
    })
    expect(parseSignedDeliveryHeaders(headers, NOW)).toEqual({ ok: false, code: 'stale_delivery' })
  })
})
