// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyExistingJob, validateAndStageOneRosterPackage } from './stage'

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

  it('reports a repeated invalid package as invalid, not as a successful duplicate', async () => {
    mocks.from.mockImplementation(() => ({
      select: () => chain({
        data: { id: 'existing', status: 'failed', dry_run: true, error_count: 3, started_at: null },
        error: null,
      }),
    }))
    const result = await validateAndStageOneRosterPackage({
      buffer: new ArrayBuffer(3), connectionId: 'connection', orgId: 'org',
    })
    expect(result).toMatchObject({ ok: true, duplicate: true, jobId: 'existing', valid: false })
    expect(mocks.readZip).not.toHaveBeenCalled()
  })

  it('clears a job whose staging aborted and restages the package', async () => {
    const events: Array<{ operation: string; filters?: unknown[][]; value?: unknown }> = []
    mocks.from.mockImplementation(() => ({
      select: () => chain({
        data: { id: 'aborted', status: 'failed', dry_run: true, error_count: 0, started_at: null },
        error: null,
      }),
      delete: () => {
        const filters: unknown[][] = []
        events.push({ operation: 'delete', filters })
        const query = {
          eq: (...args: unknown[]) => { filters.push(args); return query },
          then: (resolve: (value: unknown) => void) => Promise.resolve({ error: null }).then(resolve),
        }
        return query
      },
      insert: (value: unknown) => {
        events.push({ operation: 'insert', value })
        return chain({ data: { id: 'fresh' }, error: null })
      },
      update: (value: unknown) => {
        events.push({ operation: 'update', value })
        return chain({ error: null })
      },
    }))
    const result = await validateAndStageOneRosterPackage({
      buffer: new ArrayBuffer(3), connectionId: 'connection', orgId: 'org',
    })
    expect(result).toMatchObject({ ok: true, duplicate: false, jobId: 'fresh', valid: true })
    expect(events[0]).toEqual({
      operation: 'delete',
      filters: [['id', 'aborted'], ['org_id', 'org'], ['status', 'failed']],
    })
    expect(events[1]).toMatchObject({ operation: 'insert', value: { status: 'validating' } })
  })

  it('classifies existing jobs by whether staging actually finished', () => {
    const now = Date.parse('2026-09-23T12:00:00Z')
    const job = { id: 'j', dry_run: true, error_count: 0, started_at: null }
    expect(classifyExistingJob({ ...job, status: 'validated' }, now)).toBe('valid')
    expect(classifyExistingJob({ ...job, status: 'applied', dry_run: false }, now)).toBe('valid')
    expect(classifyExistingJob({ ...job, status: 'failed', dry_run: false, error_count: 2 }, now)).toBe('valid')
    expect(classifyExistingJob({ ...job, status: 'failed', error_count: 2 }, now)).toBe('invalid')
    expect(classifyExistingJob({ ...job, status: 'failed' }, now)).toBe('retry')
    expect(classifyExistingJob({ ...job, status: 'cancelled' }, now)).toBe('retry')
    expect(classifyExistingJob({ ...job, status: 'validating', started_at: '2026-09-23T11:55:00Z' }, now)).toBe('in_progress')
    expect(classifyExistingJob({ ...job, status: 'validating', started_at: '2026-09-23T11:00:00Z' }, now)).toBe('retry')
    expect(classifyExistingJob({ ...job, status: 'validating' }, now)).toBe('retry')
  })

  it('contains parser exceptions behind a stable error code', async () => {
    mocks.readZip.mockRejectedValue(new Error('private parser detail'))
    const result = await validateAndStageOneRosterPackage({ buffer: new ArrayBuffer(3), orgId: 'org' })
    expect(result).toEqual({ ok: false, error: 'staging_failed' })
  })
})
