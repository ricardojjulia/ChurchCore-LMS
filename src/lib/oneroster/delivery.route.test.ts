// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/integrations/oneroster/connections/[id]/deliveries/route'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  parseHeaders: vi.fn(),
  verify: vi.fn(),
  stage: vi.fn(),
}))

vi.mock('@/utils/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from }) }))
vi.mock('./signature', async (importOriginal) => ({
  ...await importOriginal<typeof import('./signature')>(),
  parseSignedDeliveryHeaders: mocks.parseHeaders,
  verifySignedDelivery: mocks.verify,
}))
vi.mock('./stage', () => ({ validateAndStageOneRosterPackage: mocks.stage }))

const connection = {
  id: '9b90c53e-ffb0-4f0a-a6dd-970df03f5f49',
  org_id: 'org',
  enabled: true,
  status: 'active',
  transport: 'signed_push',
  source_system: 'churchcore_academy',
  source_tenant_id: 'academy-org',
  schedule_interval_minutes: 60,
  signature_key_id: 'academy-2026-09',
  signature_public_key: 'public-key',
}
const headers = {
  deliveredAt: '2026-09-14T16:00:00.000Z',
  deliveryId: '7e882220-0569-4828-9251-12e97beb3137',
  keyId: 'academy-2026-09',
  signature: 'a'.repeat(86),
}

function request() {
  return new NextRequest(`http://localhost/api/integrations/oneroster/connections/${connection.id}/deliveries`, {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: new Uint8Array([1, 2, 3]),
  })
}

function deliveryContext() {
  return { params: Promise.resolve({ id: connection.id }) }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.parseHeaders.mockReturnValue({ ok: true, value: headers })
  mocks.verify.mockReturnValue(true)
  mocks.stage.mockResolvedValue({
    ok: true, duplicate: false, jobId: 'job', packageHash: 'hash', valid: true,
    validation: { preview: { totalRows: 6, validRows: 6, quarantinedRows: 0 } },
  })
  mocks.from.mockImplementation((table: string) => {
    if (table === 'oneroster_connections') {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: vi.fn(async () => ({ data: connection, error: null })),
        update: vi.fn(() => query),
        then: (resolve: (value: unknown) => void) => Promise.resolve({ error: null }).then(resolve),
      }
      return query
    }
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      insert: vi.fn(async () => ({ error: null })),
    }
    return query
  })
})

describe('signed OneRoster delivery route', () => {
  it('rejects a disabled connection before reading request authentication', async () => {
    mocks.from.mockImplementation((_table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: vi.fn(async () => ({ data: { ...connection, enabled: false, status: 'inactive' }, error: null })),
      }
      return query
    })
    const response = await POST(request(), deliveryContext())
    expect(response.status).toBe(409)
    expect(mocks.parseHeaders).not.toHaveBeenCalled()
    expect(mocks.stage).not.toHaveBeenCalled()
  })

  it('rejects an invalid signature before replay lookup or staging', async () => {
    mocks.verify.mockReturnValue(false)
    const response = await POST(request(), deliveryContext())
    expect(response.status).toBe(401)
    expect(mocks.stage).not.toHaveBeenCalled()
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it('stages a valid package for human review and acknowledges with 202', async () => {
    const response = await POST(request(), deliveryContext())
    expect(response.status).toBe(202)
    expect(mocks.stage).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: connection.id,
      orgId: 'org',
      sourceSystem: 'churchcore_academy',
    }))
    expect(await response.json()).toMatchObject({ status: 'validated', valid: true, jobId: 'job' })
  })

  it('returns 200 for an idempotent duplicate package', async () => {
    mocks.stage.mockResolvedValue({ ok: true, duplicate: true, jobId: 'job', packageHash: 'hash', valid: true })
    const response = await POST(request(), deliveryContext())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'duplicate', duplicate: true })
  })

  it('rejects a redelivered invalid package with 422 and never records it as a success', async () => {
    const updates: unknown[] = []
    const inserts: unknown[] = []
    mocks.stage.mockResolvedValue({ ok: true, duplicate: true, jobId: 'job', packageHash: 'hash', valid: false })
    mocks.from.mockImplementation((table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: vi.fn(async () => ({ data: table === 'oneroster_connections' ? connection : null, error: null })),
        insert: vi.fn(async (value: unknown) => { inserts.push(value); return { error: null } }),
        update: vi.fn((value: unknown) => { updates.push(value); return query }),
        then: (resolve: (value: unknown) => void) => Promise.resolve({ error: null }).then(resolve),
      }
      return query
    })
    const response = await POST(request(), deliveryContext())
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ status: 'invalid', duplicate: true, valid: false })
    expect(inserts[0]).toMatchObject({ status: 'invalid', error_code: 'package_invalid' })
    expect(updates[0]).not.toHaveProperty('last_success_at')
  })

  it('returns 409 while the package is mid-staging, without consuming the delivery ID', async () => {
    const inserts: unknown[] = []
    mocks.stage.mockResolvedValue({ ok: false, error: 'staging_in_progress' })
    mocks.from.mockImplementation((table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: vi.fn(async () => ({ data: table === 'oneroster_connections' ? connection : null, error: null })),
        insert: vi.fn(async (value: unknown) => { inserts.push(value); return { error: null } }),
        update: vi.fn(() => query),
      }
      return query
    })
    const response = await POST(request(), deliveryContext())
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'staging_in_progress' })
    expect(inserts).toHaveLength(0)
  })

  it('records a safe failed attempt when package staging fails', async () => {
    mocks.stage.mockResolvedValue({ ok: false, error: 'staging_failed' })
    const response = await POST(request(), deliveryContext())
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).toBe('{"error":"staging_failed"}')
  })

  it('rejects a replayed delivery ID after signature verification', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'oneroster_connections') {
        const query = { select: () => query, eq: () => query, maybeSingle: vi.fn(async () => ({ data: connection, error: null })) }
        return query
      }
      const query = { select: () => query, eq: () => query, maybeSingle: vi.fn(async () => ({ data: { id: 'attempt' }, error: null })) }
      return query
    })
    const response = await POST(request(), deliveryContext())
    expect(response.status).toBe(409)
    expect(mocks.stage).not.toHaveBeenCalled()
  })
})
