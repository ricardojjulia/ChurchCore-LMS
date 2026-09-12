// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/integrations/oneroster/jobs/[id]/identity-links/route'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), profile: vi.fn(), active: vi.fn(), from: vi.fn(), rpc: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.auth },
    rpc: mocks.active,
    from: mocks.from,
  }),
}))

vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({ rpc: mocks.rpc }),
}))

function query(result: unknown) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    neq: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => q),
    single: vi.fn(async () => result),
    then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve),
  }
  return q
}

function request(body?: unknown) {
  return new NextRequest('http://localhost/api/integrations/oneroster/jobs/job/identity-links', {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ data: { user: { id: 'actor-auth' } } })
  mocks.profile.mockResolvedValue({ data: { uid: 'actor-uid', org_id: 'org', role: 'admin' } })
  mocks.active.mockResolvedValue({ data: true, error: null })
  mocks.from.mockImplementation((table: string) => {
    if (table === 'profiles') return query({ data: { uid: 'actor-uid', org_id: 'org', role: 'admin' }, error: null })
    return query({ data: [], error: null })
  })
})

describe('OneRoster identity link API', () => {
  it('rejects anonymous reads and writes', async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } })
    expect((await GET(request(), { params: Promise.resolve({ id: 'job' }) })).status).toBe(401)
    expect((await POST(request({ sourcedId: 'user', profileUid: 'profile' }), { params: Promise.resolve({ id: 'job' }) })).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns only the tenant-scoped roster users and profile choices', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') return query({ data: { uid: 'actor-uid', org_id: 'org', role: 'admin' }, error: null })
      if (table === 'oneroster_import_jobs') return query({ data: { id: 'job', status: 'validated', org_id: 'org', source_system: 'manual' }, error: null })
      if (table === 'oneroster_import_rows') return query({ data: [{ sourced_id: 'user-1', normalized_payload: { status: 'active' }, operation: 'quarantine', status: 'valid', error_code: 'identity_linking_required', error_message: 'link required' }], error: null })
      return query({ data: [{ sourced_id: 'user-1', local_id: 'profile-1', source_status: 'active' }], error: null })
    })
    const response = await GET(request(), { params: Promise.resolve({ id: 'job' }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ users: [{ sourcedId: 'user-1', linkedProfileUid: 'profile-1' }] })
  })

  it('passes only server-derived tenant and actor identity to the link function', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') return query({ data: { uid: 'actor-uid', org_id: 'org', role: 'admin' }, error: null })
      return query({ data: [], error: null })
    })
    mocks.rpc
      .mockResolvedValueOnce({ data: { success: true }, error: null })
      .mockResolvedValueOnce({ data: { created: 0, updated: 1, unchanged: 0, deactivated: 0, quarantined: 0 }, error: null })
    const response = await POST(request({ sourcedId: 'user-1', profileUid: 'profile-1' }), { params: Promise.resolve({ id: 'job' }) })
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'link_oneroster_user', {
      p_job_id: 'job', p_org_id: 'org', p_sourced_id: 'user-1', p_profile_uid: 'profile-1',
      p_actor_auth_id: 'actor-auth', p_actor_uid: 'actor-uid',
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'preview_oneroster_job', {
      p_job_id: 'job', p_org_id: 'org', p_actor_auth_id: 'actor-auth', p_actor_uid: 'actor-uid',
    })
  })

  it('rejects incomplete link payloads before service access', async () => {
    const response = await POST(request({ sourcedId: '', profileUid: 'profile-1' }), { params: Promise.resolve({ id: 'job' }) })
    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
