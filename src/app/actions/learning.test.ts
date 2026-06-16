import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import { enrollSelf, gradeSubmission } from './learning'

// ── Service client mock (used for XP award and notifications in gradeSubmission) ──
vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      insert:       vi.fn().mockReturnThis(),
      throwOnError: vi.fn().mockReturnThis(),
      select:       vi.fn().mockReturnThis(),
      eq:           vi.fn().mockReturnThis(),
      order:        vi.fn().mockReturnThis(),
      limit:        vi.fn().mockReturnThis(),
      single:       vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
}))

// ── Proxy: any query chain awaitable with a fixed resolved value ───────────────
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
  return new Proxy({}, handler)
}

// ── Factory: authenticated supabase client with per-table resolution ───────────
function userClient(tableResults: Record<string, Record<string, unknown>> = {}) {
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
          ? { data: { uid: 'p-001', current_level: 1, role: 'student' }, error: null }
          : { data: null, error: null }),
      ),
    ),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

// ── Null-user client for auth failure tests ───────────────────────────────────
function noAuthClient() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: vi.fn(),
    rpc:  vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── enrollSelf ────────────────────────────────────────────────────────────────

describe('enrollSelf', () => {
  it('returns { error: "Not authenticated" } when user is not signed in', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(noAuthClient() as any)

    const result = await enrollSelf('course-1')
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns { error: "Profile not found" } when profile query returns null', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({ profiles: { data: null, error: null } }) as any,
    )

    const result = await enrollSelf('course-1')
    expect(result).toEqual({ error: 'Profile not found' })
  })

  it('happy path — returns {} when enrollment insert succeeds', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({
        profiles:   { data: { uid: 'p-001', current_level: 1 }, error: null },
        courses:    { data: { min_required_level: 1, prerequisite_course_id: null }, error: null },
        enrollments: { data: null, error: null },
      }) as any,
    )

    const result = await enrollSelf('course-1')
    expect(result).toEqual({})
  })

  it('returns { error: "Already enrolled" } on 23505 duplicate key error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({
        profiles:    { data: { uid: 'p-001', current_level: 1 }, error: null },
        courses:     { data: { min_required_level: 1, prerequisite_course_id: null }, error: null },
        enrollments: { data: null, error: { code: '23505', message: 'duplicate key value' } },
      }) as any,
    )

    const result = await enrollSelf('course-1')
    expect(result).toEqual({ error: 'Already enrolled' })
  })

  it('returns level error when student level is below the course minimum', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({
        profiles: { data: { uid: 'p-001', current_level: 1 }, error: null },
        courses:  { data: { min_required_level: 5, prerequisite_course_id: null }, error: null },
      }) as any,
    )

    const result = await enrollSelf('course-1')
    expect(result).toEqual({ error: 'Level 5 required — you are level 1' })
  })
})

// ── gradeSubmission ───────────────────────────────────────────────────────────

describe('gradeSubmission', () => {
  it('returns { error: "Not authenticated" } when user is not signed in', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(noAuthClient() as any)

    const result = await gradeSubmission('sub-1', 85, 'Good work')
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns { error: "Unauthorized" } when role is student (not staff)', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({
        profiles: { data: { uid: 'p-001', role: 'student' }, error: null },
      }) as any,
    )

    const result = await gradeSubmission('sub-1', 85, 'Good work')
    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('returns { error: "Submission not found" } when block_submissions query returns null', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({
        profiles:         { data: { uid: 'p-001', role: 'teacher' }, error: null },
        block_submissions: { data: null, error: null },
      }) as any,
    )

    const result = await gradeSubmission('sub-1', 85, 'Good work')
    expect(result).toEqual({ error: 'Submission not found' })
  })

  it('happy path — returns {} when grade update succeeds', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({
        profiles: { data: { uid: 'p-001', role: 'teacher' }, error: null },
        block_submissions: {
          data: { id: 'sub-1', max_score: 100, user_id: 'student-uid', block_id: 'block-1' },
          error: null,
        },
      }) as any,
    )

    const result = await gradeSubmission('sub-1', 85, 'Good work')
    expect(result).toEqual({})
  })

  it('surfaces DB error when update fails', async () => {
    // First single() → teacher profile; second single() → submission;
    // update chain → error
    let singleCall = 0
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return resolvesWith({ data: { uid: 'p-001', role: 'teacher' }, error: null })
      }
      if (table === 'block_submissions') {
        singleCall++
        if (singleCall === 1) {
          // First call: fetch the submission
          return resolvesWith({
            data: { id: 'sub-1', max_score: 100, user_id: 'u-2', block_id: 'b-1' },
            error: null,
          })
        }
        // Second call: the update — return an error
        return resolvesWith({ data: null, error: { message: 'update constraint violation' } })
      }
      return resolvesWith({ data: null, error: null })
    })

    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'auth-u-001' } }, error: null }),
      },
      from: mockFrom,
      rpc:  vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any)

    const result = await gradeSubmission('sub-1', 85, 'feedback')
    expect(result).toEqual({ error: 'update constraint violation' })
  })
})
