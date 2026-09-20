import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import { enrollSelf } from '@/app/actions/learning'

// COUNCIL-2026-026 D2 — enrollSelf() was refactored into a thin wrapper over
// the extracted enrollCore(). This file is the dedicated parity regression the
// council prompt calls for: it asserts enrollSelf()'s observable return shape
// is unchanged for the success case and for every enrollCore() SkipReason,
// independent of (and in addition to) the broader enrollSelf() coverage that
// already lives in src/app/actions/learning.test.ts. Reuses that file's exact
// Proxy-based mock pattern rather than inventing a new one.

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
          ? { data: { uid: 'p-001', current_level: 1, display_name: 'Test Student', email: null }, error: null }
          : { data: null, error: null }),
      ),
    ),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

const PROFILE = { uid: 'p-001', current_level: 1, display_name: 'Test Student', email: null, date_of_birth: null }
const OPEN_COURSE = { title: 'Course', min_required_level: 1, prerequisite_course_id: null, age_min: null, age_max: null }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('enrollSelf ↔ enrollCore parity', () => {
  it('success — ok:true translates to {} (unchanged happy-path shape)', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({
        profiles:    { data: PROFILE, error: null },
        courses:     { data: OPEN_COURSE, error: null },
        enrollments: { data: null, error: null },
      }) as any,
    )
    await expect(enrollSelf('course-1')).resolves.toEqual({})
  })

  it('invite_only skip translates to { error: message }, not a raw SkipReason', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') return resolvesWith({ data: PROFILE, error: null })
      if (table === 'course_sections') return resolvesWith({ data: { enrollment_type: 'invite_only' }, error: null })
      return resolvesWith({ data: null, error: null })
    })
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'auth-u-001' } }, error: null }) },
      from: mockFrom,
      rpc:  vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any)

    await expect(enrollSelf('course-1', 'section-invite')).resolves.toEqual({
      error: 'Enrollment by invitation only.',
    })
  })

  it('cohort_gated_no_access skip translates to { error: message }', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') return resolvesWith({ data: PROFILE, error: null })
      if (table === 'course_sections') return resolvesWith({ data: { enrollment_type: 'cohort_gated' }, error: null })
      if (table === 'cohort_members') return resolvesWith({ data: [], error: null })
      return resolvesWith({ data: null, error: null })
    })
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'auth-u-001' } }, error: null }) },
      from: mockFrom,
      rpc:  vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any)

    await expect(enrollSelf('course-1', 'section-cohort')).resolves.toEqual({
      error: 'This course requires cohort membership.',
    })
  })

  it('level_too_low skip translates to { error: message }', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({
        profiles: { data: PROFILE, error: null },
        courses:  { data: { ...OPEN_COURSE, min_required_level: 5 }, error: null },
      }) as any,
    )
    await expect(enrollSelf('course-1')).resolves.toEqual({
      error: 'Level 5 required — you are level 1',
    })
  })

  it('prerequisite_incomplete skip translates to { error: message }', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({
        profiles: { data: PROFILE, error: null },
        courses:  { data: { ...OPEN_COURSE, prerequisite_course_id: 'course-0' }, error: null },
        enrollments: { data: null, error: null },
      }) as any,
    )
    await expect(enrollSelf('course-1')).resolves.toEqual({
      error: 'You must complete the prerequisite course first',
    })
  })

  it('age_out_of_range (min) skip translates to { error: message }', async () => {
    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - 10)
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({
        profiles: { data: { ...PROFILE, date_of_birth: dob.toISOString().slice(0, 10) }, error: null },
        courses:  { data: { ...OPEN_COURSE, age_min: 18, age_max: null }, error: null },
      }) as any,
    )
    await expect(enrollSelf('course-1')).resolves.toEqual({
      error: 'This course is for ages 18+.',
    })
  })

  it('age_out_of_range (max) skip translates to { error: message }', async () => {
    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - 20)
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({
        profiles: { data: { ...PROFILE, date_of_birth: dob.toISOString().slice(0, 10) }, error: null },
        courses:  { data: { ...OPEN_COURSE, age_min: null, age_max: 12 }, error: null },
      }) as any,
    )
    await expect(enrollSelf('course-1')).resolves.toEqual({
      error: 'This course is for ages up to 12.',
    })
  })

  it('non-skip error ("Profile not found") is still a plain { error } — not treated as a skip', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({ profiles: { data: null, error: null } }) as any,
    )
    await expect(enrollSelf('course-1')).resolves.toEqual({ error: 'Profile not found' })
  })

  it('non-skip error ("Already enrolled") is still a plain { error } — not treated as a skip', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      userClient({
        profiles:    { data: PROFILE, error: null },
        courses:     { data: OPEN_COURSE, error: null },
        enrollments: { data: null, error: { code: '23505', message: 'duplicate key value' } },
      }) as any,
    )
    await expect(enrollSelf('course-1')).resolves.toEqual({ error: 'Already enrolled' })
  })
})
