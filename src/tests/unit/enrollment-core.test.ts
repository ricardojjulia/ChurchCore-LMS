import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enrollCore } from '@/lib/enrollment-core'

// COUNCIL-2026-026 Prompt D — enrollCore() unit tests.
//
// Mirrors the Proxy-based "any query chain is awaitable" mock pattern already
// established in src/app/actions/learning.test.ts. enrollCore() takes an
// explicit Supabase client argument (no createClient() indirection), so no
// module-level vi.mock() is needed here — each test builds its own client.

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

// ── Factory: fake Supabase client with per-table resolution ────────────────────
// tableResults maps table name -> the {data, error} the chain resolves to.
// A per-call override function may be supplied instead for tables that need to
// branch across multiple calls within a single enrollCore() invocation
// (e.g. course_sections is read once for enrollment_type, cohort_members and
// cohort_section_enrollments each once more for the cohort_gated path).
function coreClient(
  tableResults: Record<string, Record<string, unknown> | ((call: number) => Record<string, unknown>)> = {},
) {
  const callCounts: Record<string, number> = {}
  return {
    from: vi.fn().mockImplementation((table: string) => {
      callCounts[table] = (callCounts[table] ?? 0) + 1
      const entry = tableResults[table]
      if (typeof entry === 'function') return resolvesWith(entry(callCounts[table]))
      return resolvesWith(
        entry ??
        (table === 'profiles'
          ? { data: { uid: 'p-001', current_level: 1, date_of_birth: null }, error: null }
          : { data: null, error: null }),
      )
    }),
  }
}

const DEFAULT_PROFILE = { uid: 'p-001', current_level: 1, date_of_birth: null }
const OPEN_COURSE = {
  title: 'Open Course', min_required_level: 1, prerequisite_course_id: null, age_min: null, age_max: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('enrollCore', () => {
  it('returns { ok: false, error: "Profile not found" } when the profile lookup fails', async () => {
    const supabase = coreClient({ profiles: { data: null, error: null } })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1' })
    expect(result).toEqual({ ok: false, skipped: false, error: 'Profile not found' })
  })

  it('open section — succeeds and returns the course title', async () => {
    const supabase = coreClient({
      profiles: { data: DEFAULT_PROFILE, error: null },
      course_sections: { data: { enrollment_type: 'open' }, error: null },
      courses: { data: OPEN_COURSE, error: null },
      enrollments: { data: null, error: null },
    })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1', sectionId: 'section-open' })
    expect(result).toEqual({ ok: true, courseTitle: 'Open Course' })
  })

  it('no section linked to the course — treated as open, succeeds', async () => {
    const supabase = coreClient({
      profiles: { data: DEFAULT_PROFILE, error: null },
      courses: (call) =>
        call === 1
          ? { data: { blueprint_id: null }, error: null } // blueprint lookup
          : { data: OPEN_COURSE, error: null },            // prerequisite/age lookup
      enrollments: { data: null, error: null },
    })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1' })
    expect(result).toEqual({ ok: true, courseTitle: 'Open Course' })
  })

  it('invite_only — returns SkipReason "invite_only" without inserting', async () => {
    const supabase = coreClient({
      profiles: { data: DEFAULT_PROFILE, error: null },
      course_sections: { data: { enrollment_type: 'invite_only' }, error: null },
    })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1', sectionId: 'section-invite' })
    expect(result).toEqual({
      ok: false, skipped: true, reason: 'invite_only', message: 'Enrollment by invitation only.',
    })
  })

  it('cohort_gated — no active cohort membership returns SkipReason "cohort_gated_no_access"', async () => {
    const supabase = coreClient({
      profiles: { data: DEFAULT_PROFILE, error: null },
      course_sections: { data: { enrollment_type: 'cohort_gated' }, error: null },
      cohort_members: { data: [], error: null },
    })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1', sectionId: 'section-cohort' })
    expect(result).toEqual({
      ok: false, skipped: true, reason: 'cohort_gated_no_access', message: 'This course requires cohort membership.',
    })
  })

  it('cohort_gated — cohort membership exists but is not enrolled in this section returns the same SkipReason', async () => {
    const supabase = coreClient({
      profiles: { data: DEFAULT_PROFILE, error: null },
      course_sections: { data: { enrollment_type: 'cohort_gated' }, error: null },
      cohort_members: { data: [{ cohort_id: 'cohort-x' }], error: null },
      cohort_section_enrollments: { data: null, error: null },
    })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1', sectionId: 'section-cohort' })
    expect(result).toEqual({
      ok: false, skipped: true, reason: 'cohort_gated_no_access', message: 'This course requires cohort membership.',
    })
  })

  it('cohort_gated — cohort enrolled in the section succeeds', async () => {
    const supabase = coreClient({
      profiles: { data: DEFAULT_PROFILE, error: null },
      course_sections: { data: { enrollment_type: 'cohort_gated' }, error: null },
      cohort_members: { data: [{ cohort_id: 'cohort-x' }], error: null },
      cohort_section_enrollments: { data: { id: 'cse-1' }, error: null },
      courses: { data: OPEN_COURSE, error: null },
      enrollments: { data: null, error: null },
    })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1', sectionId: 'section-cohort' })
    expect(result).toEqual({ ok: true, courseTitle: 'Open Course' })
  })

  it('prerequisite unmet — returns SkipReason "prerequisite_incomplete"', async () => {
    const supabase = coreClient({
      profiles: { data: DEFAULT_PROFILE, error: null },
      course_sections: { data: { enrollment_type: 'open' }, error: null },
      courses: { data: { ...OPEN_COURSE, prerequisite_course_id: 'course-0' }, error: null },
      enrollments: { data: null, error: null }, // prereq completion check → no completed row
    })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1', sectionId: 'section-open' })
    expect(result).toEqual({
      ok: false, skipped: true, reason: 'prerequisite_incomplete',
      message: 'You must complete the prerequisite course first',
    })
  })

  it('level too low — returns SkipReason "level_too_low"', async () => {
    const supabase = coreClient({
      profiles: { data: DEFAULT_PROFILE, error: null },
      course_sections: { data: { enrollment_type: 'open' }, error: null },
      courses: { data: { ...OPEN_COURSE, min_required_level: 5 }, error: null },
    })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1', sectionId: 'section-open' })
    expect(result).toEqual({
      ok: false, skipped: true, reason: 'level_too_low',
      message: 'Level 5 required — you are level 1',
    })
  })

  it('age below age_min — returns SkipReason "age_out_of_range"', async () => {
    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - 10)
    const supabase = coreClient({
      profiles: { data: { ...DEFAULT_PROFILE, date_of_birth: dob.toISOString().slice(0, 10) }, error: null },
      course_sections: { data: { enrollment_type: 'open' }, error: null },
      courses: { data: { ...OPEN_COURSE, age_min: 18, age_max: null }, error: null },
    })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1', sectionId: 'section-open' })
    expect(result).toEqual({
      ok: false, skipped: true, reason: 'age_out_of_range', message: 'This course is for ages 18+.',
    })
  })

  it('age above age_max — returns SkipReason "age_out_of_range"', async () => {
    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - 20)
    const supabase = coreClient({
      profiles: { data: { ...DEFAULT_PROFILE, date_of_birth: dob.toISOString().slice(0, 10) }, error: null },
      course_sections: { data: { enrollment_type: 'open' }, error: null },
      courses: { data: { ...OPEN_COURSE, age_min: null, age_max: 12 }, error: null },
    })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1', sectionId: 'section-open' })
    expect(result).toEqual({
      ok: false, skipped: true, reason: 'age_out_of_range', message: 'This course is for ages up to 12.',
    })
  })

  it('duplicate enrollment (23505) — returns { error: "Already enrolled" }, not a SkipReason', async () => {
    const supabase = coreClient({
      profiles: { data: DEFAULT_PROFILE, error: null },
      course_sections: { data: { enrollment_type: 'open' }, error: null },
      courses: { data: OPEN_COURSE, error: null },
      enrollments: { data: null, error: { code: '23505', message: 'duplicate key value' } },
    })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1', sectionId: 'section-open' })
    expect(result).toEqual({ ok: false, skipped: false, error: 'Already enrolled' })
  })

  it('other insert error — surfaces the raw DB error message', async () => {
    const supabase = coreClient({
      profiles: { data: DEFAULT_PROFILE, error: null },
      course_sections: { data: { enrollment_type: 'open' }, error: null },
      courses: { data: OPEN_COURSE, error: null },
      enrollments: { data: null, error: { code: '23503', message: 'insert or update violates foreign key constraint' } },
    })
    const result = await enrollCore({ supabase: supabase as any, authId: 'auth-1', courseId: 'course-1', sectionId: 'section-open' })
    expect(result).toEqual({
      ok: false, skipped: false, error: 'insert or update violates foreign key constraint',
    })
  })
})
