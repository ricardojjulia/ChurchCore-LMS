// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, PUT } from '@/app/api/integrations/oneroster/connections/route'

const mocks = vi.hoisted(() => ({
  adminContext: vi.fn(),
  from: vi.fn(),
  validKeyId: vi.fn(),
  validPublicKey: vi.fn(),
}))

vi.mock('./admin-context', () => ({ getOneRosterAdminContext: mocks.adminContext }))
vi.mock('./signature', () => ({
  isValidDeliveryKeyId: mocks.validKeyId,
  isValidEd25519PublicKey: mocks.validPublicKey,
}))

function query(result: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    update: vi.fn((_value?: unknown) => chain),
    insert: vi.fn((_value?: unknown) => chain),
  }
  return chain
}

function saveRequest(overrides: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/integrations/oneroster/connections', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Academy',
      sourceTenantId: 'academy-org',
      keyId: 'academy-key',
      publicKey: 'public-key',
      scheduleIntervalMinutes: 60,
      enabled: true,
      ...overrides,
    }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.adminContext.mockResolvedValue({
    supabase: { from: mocks.from }, orgId: 'org', profileUid: 'profile', authId: 'auth',
  })
  mocks.validKeyId.mockReturnValue(true)
  mocks.validPublicKey.mockReturnValue(true)
})

describe('OneRoster connection route', () => {
  it('rejects invalid public key material before writing', async () => {
    mocks.validPublicKey.mockReturnValue(false)
    const response = await PUT(saveRequest())
    expect(response.status).toBe(400)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('creates a tenant-scoped inbound Academy connection with public material only', async () => {
    const saved = {
      id: '9b90c53e-ffb0-4f0a-a6dd-970df03f5f49', name: 'Academy', enabled: true,
      source_tenant_id: 'academy-org', status: 'active', transport: 'signed_push',
      schedule_interval_minutes: 60, signature_algorithm: 'ed25519',
      signature_key_id: 'academy-key', signature_public_key: 'public-key',
    }
    const connectionQuery = query({ data: saved, error: null })
    mocks.from.mockReturnValue(connectionQuery)

    const response = await PUT(saveRequest())

    expect(response.status).toBe(200)
    expect(connectionQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: 'org',
      created_by: 'profile',
      mode: 'academy_csv',
      provider: 'churchcore_academy',
      transport: 'signed_push',
      signature_public_key: 'public-key',
    }))
    expect(JSON.stringify(connectionQuery.insert.mock.calls[0][0])).not.toContain('private')
  })

  it('returns no connection without reading attempt history', async () => {
    mocks.from.mockReturnValue(query({ data: null, error: null }))
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ connection: null, attempts: [] })
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })
})
