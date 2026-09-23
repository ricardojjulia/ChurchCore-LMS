// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/integrations/oneroster/jobs/[id]/preview/route'

const mocks = vi.hoisted(() => ({
  adminContext: vi.fn(),
  preview: vi.fn(),
  from: vi.fn(),
}))

vi.mock('./admin-context', () => ({ getOneRosterAdminContext: mocks.adminContext }))
vi.mock('./apply', () => ({ previewOneRosterJob: mocks.preview }))

function chain(result: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    single: vi.fn(async () => result),
    order: () => query,
    range: vi.fn(async () => result),
  }
  return query
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.adminContext.mockResolvedValue({
    supabase: { from: mocks.from }, orgId: 'org', profileUid: 'profile', authId: 'auth',
  })
  mocks.preview.mockResolvedValue({ created: 1, updated: 0, unchanged: 1, deactivated: 0, quarantined: 0 })
  mocks.from.mockImplementation((table: string) => table === 'oneroster_import_jobs'
    ? chain({ data: { id: 'job', status: 'validated', total_rows: 2, quarantined_count: 0 }, error: null })
    : chain({ data: [
        { file_type: 'users', row_number: 2, status: 'valid', error_code: null, error_message: null },
        { file_type: 'courses', row_number: 2, status: 'valid', error_code: null, error_message: null },
      ], error: null }))
})

describe('received OneRoster job preview route', () => {
  it('derives tenant and actor scope before preparing review', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/integrations/oneroster/jobs/job/preview', { method: 'POST' }),
      { params: Promise.resolve({ id: 'job' }) },
    )
    expect(response.status).toBe(200)
    expect(mocks.preview).toHaveBeenCalledWith({ jobId: 'job', orgId: 'org', actorAuthId: 'auth', actorUid: 'profile' })
    expect(await response.json()).toMatchObject({
      valid: true,
      preview: { totalRows: 2, byFile: { users: { totalRows: 1 }, courses: { totalRows: 1 } } },
    })
  })

  it('pages staged rows on a unique (file_type, row_number) ordering', async () => {
    const orderCalls: unknown[][] = []
    mocks.from.mockImplementation((table: string) => {
      const query = table === 'oneroster_import_jobs'
        ? chain({ data: { id: 'job', status: 'validated', total_rows: 0, quarantined_count: 0 }, error: null })
        : chain({ data: [], error: null })
      query.order = (...args: unknown[]) => { orderCalls.push(args); return query }
      return query
    })
    await POST(
      new NextRequest('http://localhost/api/integrations/oneroster/jobs/job/preview', { method: 'POST' }),
      { params: Promise.resolve({ id: 'job' }) },
    )
    expect(orderCalls.map(([column]) => column)).toEqual(['file_type', 'row_number'])
  })

  it('does not preview a failed job', async () => {
    mocks.from.mockReturnValue(chain({ data: { id: 'job', status: 'failed', total_rows: 2, quarantined_count: 2 }, error: null }))
    const response = await POST(
      new NextRequest('http://localhost/api/integrations/oneroster/jobs/job/preview', { method: 'POST' }),
      { params: Promise.resolve({ id: 'job' }) },
    )
    expect(response.status).toBe(409)
    expect(mocks.preview).not.toHaveBeenCalled()
  })
})
