import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import { addCohortMember, removeCohortMember, searchCohortMembers } from './cohorts'

// ── Proxy that makes any query chain awaitable with a fixed resolved value ────
function resolvesWith(value: Record<string, unknown>) {
  const handler: ProxyHandler<object> = {
    get(_, prop) {
      if (prop === 'then') {
        return (res: (v: unknown) => void) => Promise.resolve(value).then(res)
      }
      if (typeof prop === 'symbol') return undefined
      return (..._args: unknown[]) => new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler) as ReturnType<typeof createClient>
}

// ── Factory: authenticated admin supabase client mock ─────────────────────────
function adminClient(tableResults: Record<string, Record<string, unknown>> = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'auth-u-001' } },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) =>
      resolvesWith(
        tableResults[table] ??
        (table === 'profiles'
          ? { data: { uid: 'p-001', role: 'admin' }, error: null }
          : { data: null, error: null }),
      ),
    ),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── addCohortMember ───────────────────────────────────────────────────────────

describe('addCohortMember', () => {
  it('happy path — returns {} on success', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(adminClient() as any)

    const result = await addCohortMember('cohort-1', 'user-1')
    expect(result).toEqual({})
  })

  it('returns error message when user is already in the cohort (23505)', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      adminClient({
        cohort_members: { data: null, error: { message: 'duplicate', code: '23505' } },
      }) as any,
    )

    const result = await addCohortMember('cohort-1', 'user-1')
    expect(result).toEqual({ error: 'User is already in this cohort' })
  })

  it('surfaces DB error message on unexpected insert failure', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      adminClient({
        cohort_members: { data: null, error: { message: 'relation not found', code: 'PGRST001' } },
      }) as any,
    )

    const result = await addCohortMember('cohort-1', 'user-1')
    expect(result).toEqual({ error: 'relation not found' })
  })

  it('rejects when caller is not authenticated (requireAdmin throws)', async () => {
    // setup.ts default mock has getUser returning null — triggers requireAdmin throw.
    // The .catch() in addCohortMember returns a non-supabase object, so from() throws.
    await expect(addCohortMember('cohort-1', 'user-1')).rejects.toThrow()
  })
})

// ── removeCohortMember ────────────────────────────────────────────────────────

describe('removeCohortMember', () => {
  it('happy path — returns {} on success', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(adminClient() as any)

    const result = await removeCohortMember('cohort-1', 'user-1')
    expect(result).toEqual({})
  })

  it('surfaces DB error message on update failure', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      adminClient({
        cohort_members: { data: null, error: { message: 'update failed' } },
      }) as any,
    )

    const result = await removeCohortMember('cohort-1', 'user-1')
    expect(result).toEqual({ error: 'update failed' })
  })
})

// ── searchCohortMembers ───────────────────────────────────────────────────────

describe('searchCohortMembers', () => {
  it('returns [] when caller is not authenticated', async () => {
    // setup.ts default mock: getUser returns null → requireAdmin throws → caught → []
    const result = await searchCohortMembers('cohort-1', 'test')
    expect(result).toEqual([])
  })

  it('returns members matching the query string (client-side filter)', async () => {
    const mockMembers = [
      {
        id: 'cm-001',
        user_id: 'u-111',
        status: 'active',
        joined_at: '2026-01-01T00:00:00Z',
        notes: null,
        auth_user: { email: 'alice@example.com' },
      },
      {
        id: 'cm-002',
        user_id: 'u-222',
        status: 'active',
        joined_at: '2026-01-02T00:00:00Z',
        notes: null,
        auth_user: { email: 'bob@example.com' },
      },
    ]

    vi.mocked(createClient).mockResolvedValueOnce(
      adminClient({
        cohort_members: { data: mockMembers, error: null },
      }) as any,
    )

    const result = await searchCohortMembers('cohort-1', 'alice')
    expect(result).toHaveLength(1)
    expect((result[0] as any).auth_user?.email).toBe('alice@example.com')
  })
})
