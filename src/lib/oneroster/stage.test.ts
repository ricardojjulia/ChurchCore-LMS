// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateAndStageOneRosterPackage } from './stage'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  readZip: vi.fn(),
  validatePackage: vi.fn(),
}))

vi.mock('@/utils/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from }) }))
vi.mock('./zip', () => ({ readOneRosterZip: mocks.readZip }))
vi.mock('./validate', () => ({ validateOneRosterPackage: mocks.validatePackage }))

function chain(result: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve),
  }
  return query
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.readZip.mockResolvedValue({ files: [], issues: [] })
  mocks.validatePackage.mockReturnValue({
    files: [],
    issues: [],
    preview: { totalRows: 0, validRows: 0, quarantinedRows: 0, byFile: {} },
  })
})

describe('validateAndStageOneRosterPackage', () => {
  it.each([false, true])('publishes validated only after all row batches succeed (failure=%s)', async (fail) => {
    const events: Array<{ table: string; operation: string; value: unknown }> = []
    let batches = 0
    mocks.from.mockImplementation((table: string) => ({
      insert: (value: unknown) => {
        events.push({ table, operation: 'insert', value })
        if (table === 'oneroster_import_jobs') return chain({ data: { id: 'job' }, error: null })
        batches += 1
        return chain({ error: fail && batches === 2 ? { message: 'private DB failure' } : null })
      },
      update: (value: unknown) => {
        events.push({ table, operation: 'update', value })
        return chain({ error: null })
      },
    }))
    mocks.validatePackage.mockReturnValue({
      files: [{ fileType: 'courses', rows: Array.from({ length: 1005 }, (_, i) => ({
        fileType: 'courses', rowNumber: i + 2, sourcedId: `course-${i}`, data: { title: 'Test' },
      })) }],
      issues: [],
      preview: { totalRows: 1005, validRows: 1005, quarantinedRows: 0, byFile: {} },
    })

    const result = await validateAndStageOneRosterPackage({ buffer: new ArrayBuffer(3), orgId: 'org', uploadedBy: 'uid' })

    expect(result.ok).toBe(!fail)
    expect(events[0].value).toMatchObject({ status: 'validating', org_id: 'org', uploaded_by: 'uid' })
    expect(events[0].value).not.toHaveProperty('package_filename')
    expect(events.at(-1)?.value).toMatchObject({ status: fail ? 'failed' : 'validated' })
    expect(batches).toBe(fail ? 2 : 3)
    expect(JSON.stringify(result)).not.toContain('private')
    if (fail) expect(events.some((event) => (event.value as { status?: string }).status === 'validated')).toBe(false)
  })

  it('returns the existing job for a repeated package on the same connection and tenant', async () => {
    mocks.from.mockImplementation(() => ({
      select: () => {
        const query = chain({ data: { id: 'existing', status: 'validated' }, error: null })
        return query
      },
    }))

    const result = await validateAndStageOneRosterPackage({
      buffer: new ArrayBuffer(3), connectionId: 'connection', orgId: 'org',
    })

    expect(result).toMatchObject({ ok: true, duplicate: true, jobId: 'existing', valid: true })
    expect(mocks.readZip).not.toHaveBeenCalled()
  })

  it('contains parser exceptions behind a stable error code', async () => {
    mocks.readZip.mockRejectedValue(new Error('private parser detail'))
    const result = await validateAndStageOneRosterPackage({ buffer: new ArrayBuffer(3), orgId: 'org' })
    expect(result).toEqual({ ok: false, error: 'staging_failed' })
  })
})
