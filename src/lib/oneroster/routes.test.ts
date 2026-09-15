// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as validate } from '@/app/api/integrations/oneroster/validate/route'
import { POST as apply } from '@/app/api/integrations/oneroster/jobs/[id]/apply/route'
import { GET as history } from '@/app/api/integrations/oneroster/jobs/route'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), profile: vi.fn(), active: vi.fn(),
  applyJob: vi.fn(), previewJob: vi.fn(), history: vi.fn(), stagePackage: vi.fn(),
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: mocks.auth }, rpc: mocks.active,
  from: (table: string) => {
    if (table !== 'profiles') return mocks.history()
    const q = { select: () => q, eq: () => q, single: mocks.profile }
    return q
  },
}) }))
vi.mock('@/lib/oneroster', () => ({
  previewOneRosterJob: mocks.previewJob,
}))
vi.mock('@/lib/oneroster/apply', () => ({ applyOneRosterJob: mocks.applyJob }))
vi.mock('@/lib/oneroster/stage', () => ({ validateAndStageOneRosterPackage: mocks.stagePackage }))

function request(file: Blob | string = new Blob(['zip'], { type: 'application/zip' })) {
  const form = new FormData()
  if (typeof file === 'string') form.append('file', file)
  else form.append('file', file, 'private-name.zip')
  return new NextRequest('http://localhost/api/integrations/oneroster/validate', { method: 'POST', body: form })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ data: { user: { id: 'auth' } } })
  mocks.profile.mockResolvedValue({ data: { uid: 'uid', org_id: 'org', role: 'admin' } })
  mocks.active.mockResolvedValue({ data: true, error: null })
  mocks.stagePackage.mockResolvedValue({
    ok: true,
    duplicate: false,
    jobId: 'job',
    packageHash: 'hash',
    valid: true,
    validation: { files: [], preview: { totalRows: 0, validRows: 0, quarantinedRows: 0, byFile: {} }, issues: [] },
    issues: [],
  })
  mocks.previewJob.mockResolvedValue({ created: 0, updated: 0, unchanged: 0, deactivated: 0, quarantined: 0 })
  mocks.history.mockImplementation(() => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: vi.fn(async () => ({ data: [], error: null })) }
    return q
  })
})

describe('OneRoster API boundaries', () => {
  it('rejects anonymous upload and apply before using service access', async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } })
    expect((await validate(request())).status).toBe(401)
    expect((await apply(request(), { params: Promise.resolve({ id: 'job' }) })).status).toBe(401)
    expect(mocks.stagePackage).not.toHaveBeenCalled()
    expect(mocks.applyJob).not.toHaveBeenCalled()
  })

  it.each(['student', 'teacher', 'guardian'])('rejects %s imports', async (role) => {
    mocks.profile.mockResolvedValue({ data: { uid: 'uid', org_id: 'org', role } })
    expect((await validate(request())).status).toBe(403)
    expect((await apply(request(), { params: Promise.resolve({ id: 'job' }) })).status).toBe(403)
    expect(mocks.stagePackage).not.toHaveBeenCalled()
    expect(mocks.applyJob).not.toHaveBeenCalled()
  })

  it('rejects suspended tenants even if their profile is readable', async () => {
    mocks.active.mockResolvedValue({ data: false, error: null })
    expect((await validate(request())).status).toBe(403)
    expect(mocks.stagePackage).not.toHaveBeenCalled()
  })

  it('rejects text masquerading as an uploaded file', async () => {
    expect((await validate(request('not-a-file'))).status).toBe(400)
    expect(mocks.stagePackage).not.toHaveBeenCalled()
  })

  it('derives apply scope from the session', async () => {
    mocks.applyJob.mockResolvedValue({ error: 'Import job not found' })
    const response = await apply(request(), { params: Promise.resolve({ id: 'other-tenant-job' }) })
    expect(response.status).toBe(400)
    expect(mocks.applyJob).toHaveBeenCalledWith({ jobId: 'other-tenant-job', orgId: 'org', actorAuthId: 'auth', actorUid: 'uid' })
  })

  it('derives preview scope from the session and returns planned changes', async () => {
    const response = await validate(request())
    expect(response.status).toBe(200)
    expect(mocks.previewJob).toHaveBeenCalledWith({ jobId: 'job', orgId: 'org', actorAuthId: 'auth', actorUid: 'uid' })
    expect(await response.json()).toMatchObject({ diff: { created: 0, unchanged: 0 } })
  })

  it('returns tenant-scoped import history', async () => {
    const limit = vi.fn(async () => ({
      data: [{ id: 'job', status: 'applied', total_rows: 6, created_count: 3, updated_count: 0,
        unchanged_count: 3, deactivated_count: 0, quarantined_count: 0, error_count: 0,
        connection_id: null, source_system: 'manual', created_at: '2026-09-08T12:00:00Z', completed_at: '2026-09-08T12:01:00Z' }],
      error: null,
    }))
    mocks.history.mockImplementation(() => {
      const q = { select: () => q, eq: () => q, order: () => q, limit }
      return q
    })
    const response = await history()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ jobs: [{ id: 'job', created: 3, unchanged: 3 }] })
  })

})
