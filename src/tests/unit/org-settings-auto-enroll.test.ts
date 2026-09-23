import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { getAutoEnrollCourses, addAutoEnrollCourse, removeAutoEnrollCourse } from '@/app/actions/org-settings'
import { covers } from '../covers'

covers('action:org-settings.getAutoEnrollCourses', 'action:org-settings.addAutoEnrollCourse', 'action:org-settings.removeAutoEnrollCourse')

// COUNCIL-2026-026 Prompt D — org-settings.ts auto-enroll CRUD unit tests.
//
// @/utils/supabase/server is mocked globally by src/tests/setup.ts (same base
// as src/app/actions/learning.test.ts) — createClient() is overridden per test
// via vi.mocked(createClient).mockResolvedValueOnce(...), exactly like that
// file does. @/utils/supabase/service is NOT globally mocked, so it gets a
// local vi.mock() here, same as learning.test.ts's service-client mock block.

const ORG_A = 'org-aaaaaaaa-0000-0000-0000-000000000001'
const ORG_B = 'org-bbbbbbbb-0000-0000-0000-000000000002'

// ── Fake "organizations" table backed by an in-memory settings store ───────────
// addAutoEnrollCourse/removeAutoEnrollCourse do a real read-modify-write against
// organizations.settings, so the cap-enforcement test needs state that actually
// persists across calls within a test — a flat resolvesWith() proxy can't do
// that, so this is a small purpose-built fake instead.
// courseOrgMap models the `courses` table for the H1 cross-org validation
// added to addAutoEnrollCourse(). When omitted, every queried courseId is
// treated as belonging to whichever org is being queried against — this
// keeps every pre-existing test in this file (written before H1's fix)
// passing unmodified, since none of them care about course/org matching.
// Mirrors the two atomic Postgres functions in
// 20260920074500_atomic_auto_enroll_courses.sql (add_auto_enroll_course /
// remove_auto_enroll_course) closely enough to exercise org-settings.ts's
// call sites — cap check, dedupe-is-a-no-op, and store mutation semantics —
// without needing a real database for these unit tests.
function makeServiceClient(
  initialSettingsByOrg: Record<string, Record<string, unknown>>,
  courseOrgMap?: Record<string, string>,
) {
  const store = new Map<string, Record<string, unknown>>(Object.entries(initialSettingsByOrg))
  return {
    client: {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'courses') {
          return {
            select: () => ({
              eq: (_col1: string, courseId: string) => ({
                eq: (_col2: string, orgId: string) => ({
                  maybeSingle: async () => {
                    const belongsToOrg = courseOrgMap ? courseOrgMap[courseId] === orgId : true
                    return { data: belongsToOrg ? { id: courseId } : null, error: null }
                  },
                }),
              }),
            }),
          }
        }
        if (table !== 'organizations') throw new Error(`unexpected table: ${table}`)
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              single: async () => ({ data: { settings: store.get(id) ?? {} }, error: null }),
            }),
          }),
        }
      }),
      rpc: vi.fn().mockImplementation((fn: string, args: Record<string, unknown>) => {
        const orgId    = args.p_org_id as string
        const courseId = args.p_course_id as string
        const settings = store.get(orgId)

        if (!settings) return Promise.resolve({ data: null, error: { message: 'org_not_found' } })

        const current = Array.isArray((settings as { auto_enroll_courses?: unknown }).auto_enroll_courses)
          ? ((settings as { auto_enroll_courses: string[] }).auto_enroll_courses)
          : []

        if (fn === 'add_auto_enroll_course') {
          const max = (args.p_max as number) ?? 10
          if (current.includes(courseId)) {
            return Promise.resolve({ data: current, error: null })
          }
          if (current.length >= max) {
            return Promise.resolve({ data: null, error: { message: 'auto_enroll_cap_exceeded' } })
          }
          const updated = [...current, courseId]
          store.set(orgId, { ...settings, auto_enroll_courses: updated })
          return Promise.resolve({ data: updated, error: null })
        }

        if (fn === 'remove_auto_enroll_course') {
          const updated = current.filter((id) => id !== courseId)
          store.set(orgId, { ...settings, auto_enroll_courses: updated })
          return Promise.resolve({ data: updated, error: null })
        }

        throw new Error(`unexpected rpc: ${fn}`)
      }),
    },
    store,
  }
}

// ── Fake session client for assertOrgAdminOrPlatformAdmin() ────────────────────
function sessionClient({
  authenticated = true,
  isPlatformAdmin = false,
  callerOrgId,
  callerRole = 'admin',
  profileMissing = false,
}: {
  authenticated?: boolean
  isPlatformAdmin?: boolean
  callerOrgId?: string
  callerRole?: string
  profileMissing?: boolean
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: 'auth-caller' } : null },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: isPlatformAdmin, error: null }),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: profileMissing ? null : { org_id: callerOrgId, role: callerRole },
                error: null,
              }),
            }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }
    }),
  }
}

vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Cross-org rejection (exercised from the actual denied caller's session) ────

describe('assertOrgAdminOrPlatformAdmin — cross-org rejection', () => {
  it('an org admin of Org B is rejected when targeting Org A (not platform admin)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_B, callerRole: 'admin' }) as any,
    )
    const { client } = makeServiceClient({ [ORG_A]: {} })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    await expect(addAutoEnrollCourse(ORG_A, 'course-1')).rejects.toThrow('Forbidden')
  })

  it('cross-org rejection also applies to getAutoEnrollCourses and removeAutoEnrollCourse', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_B, callerRole: 'admin' }) as any,
    )
    const { client } = makeServiceClient({ [ORG_A]: { auto_enroll_courses: ['course-1'] } })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    await expect(getAutoEnrollCourses(ORG_A)).rejects.toThrow('Forbidden')
    await expect(removeAutoEnrollCourse(ORG_A, 'course-1')).rejects.toThrow('Forbidden')
  })

  it('an unauthenticated caller is rejected before any org comparison', async () => {
    vi.mocked(createClient).mockResolvedValue(sessionClient({ authenticated: false }) as any)
    const { client } = makeServiceClient({ [ORG_A]: {} })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    await expect(addAutoEnrollCourse(ORG_A, 'course-1')).rejects.toThrow('Unauthenticated')
  })

  it('a non-admin/manager role in the correct org is still rejected', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'student' }) as any,
    )
    const { client } = makeServiceClient({ [ORG_A]: {} })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    await expect(addAutoEnrollCourse(ORG_A, 'course-1')).rejects.toThrow('Forbidden')
  })
})

// ── Platform admin can edit any org's list ──────────────────────────────────────

describe('assertOrgAdminOrPlatformAdmin — platform admin bypass', () => {
  it('a platform admin can add a course to an org they do not belong to', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: true, callerOrgId: ORG_B, callerRole: 'student' }) as any,
    )
    const { client, store } = makeServiceClient({ [ORG_A]: {} })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await addAutoEnrollCourse(ORG_A, 'course-1')
    expect(result).toEqual({})
    expect(store.get(ORG_A)).toEqual({ auto_enroll_courses: ['course-1'] })
  })

  it('a platform admin can read and remove courses for any org', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: true, callerOrgId: ORG_B, callerRole: 'teacher' }) as any,
    )
    const { client, store } = makeServiceClient({ [ORG_A]: { auto_enroll_courses: ['course-1', 'course-2'] } })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    await expect(getAutoEnrollCourses(ORG_A)).resolves.toEqual(['course-1', 'course-2'])

    const result = await removeAutoEnrollCourse(ORG_A, 'course-1')
    expect(result).toEqual({})
    expect(store.get(ORG_A)).toEqual({ auto_enroll_courses: ['course-2'] })
  })
})

// ── 10-course cap enforcement ────────────────────────────────────────────────────

describe('addAutoEnrollCourse — 10-course cap', () => {
  it('allows adding the 10th course', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const nineCourses = Array.from({ length: 9 }, (_, i) => `course-${i + 1}`)
    const { client, store } = makeServiceClient({ [ORG_A]: { auto_enroll_courses: nineCourses } })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await addAutoEnrollCourse(ORG_A, 'course-10')
    expect(result).toEqual({})
    expect((store.get(ORG_A)!.auto_enroll_courses as string[])).toHaveLength(10)
  })

  it('rejects adding an 11th course once the org already has 10', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const tenCourses = Array.from({ length: 10 }, (_, i) => `course-${i + 1}`)
    const { client, store } = makeServiceClient({ [ORG_A]: { auto_enroll_courses: tenCourses } })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await addAutoEnrollCourse(ORG_A, 'course-11')
    expect(result).toEqual({ error: 'You can auto-enroll at most 10 courses.' })
    // Store must be unchanged — the rejected write must not have gone through.
    expect((store.get(ORG_A)!.auto_enroll_courses as string[])).toEqual(tenCourses)
  })

  it('adding a course already in the list is a no-op success, not a cap violation', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const tenCourses = Array.from({ length: 10 }, (_, i) => `course-${i + 1}`)
    const { client, store } = makeServiceClient({ [ORG_A]: { auto_enroll_courses: tenCourses } })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await addAutoEnrollCourse(ORG_A, 'course-1') // already present
    expect(result).toEqual({})
    expect((store.get(ORG_A)!.auto_enroll_courses as string[])).toHaveLength(10)
  })
})

// ── Cross-org course validation (H1 fix — implementation-validator finding) ────
// addAutoEnrollCourse() must reject a courseId that belongs to a different
// org, since accepting it would silently point every future registrant's
// real enrollments row at a foreign org's course — a tenant-isolation
// violation with no other guard against it (the org_id-stamping trigger only
// validates the enrollment's own org, never the course/org relationship).

describe('addAutoEnrollCourse — cross-org course validation', () => {
  it('rejects a course that belongs to a different org', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const { client, store } = makeServiceClient(
      { [ORG_A]: {} },
      { 'foreign-course': ORG_B },
    )
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await addAutoEnrollCourse(ORG_A, 'foreign-course')
    expect(result).toEqual({ error: 'Course not found in this organization.' })
    // The rejected course must never reach the store.
    expect(store.get(ORG_A)).toEqual({})
  })

  it('accepts a course that belongs to the target org', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const { client, store } = makeServiceClient(
      { [ORG_A]: {} },
      { 'own-course': ORG_A },
    )
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await addAutoEnrollCourse(ORG_A, 'own-course')
    expect(result).toEqual({})
    expect(store.get(ORG_A)).toEqual({ auto_enroll_courses: ['own-course'] })
  })
})

// ── RPC failure surfaces a generic error, not a raw DB message ──────────────────

describe('addAutoEnrollCourse / removeAutoEnrollCourse — RPC failure handling', () => {
  it('a non-cap RPC error from add_auto_enroll_course surfaces the generic failure message', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const service = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'courses') {
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'course-1' }, error: null }) }) }) }) }
        }
        throw new Error(`unexpected table: ${table}`)
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'org_not_found' } }),
    }
    vi.mocked(createServiceClient).mockReturnValue(service as any)

    await expect(addAutoEnrollCourse(ORG_A, 'course-1')).resolves.toEqual({
      error: 'Failed to update auto-enroll courses',
    })
  })

  it('an RPC error from remove_auto_enroll_course surfaces the generic failure message', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const service = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'org_not_found' } }),
    }
    vi.mocked(createServiceClient).mockReturnValue(service as any)

    await expect(removeAutoEnrollCourse(ORG_A, 'course-1')).resolves.toEqual({
      error: 'Failed to update auto-enroll courses',
    })
  })
})

// ── getAutoEnrollCourses defaulting ──────────────────────────────────────────────

describe('getAutoEnrollCourses', () => {
  it('returns an empty array when the org has no auto_enroll_courses key set', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const { client } = makeServiceClient({ [ORG_A]: {} })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    await expect(getAutoEnrollCourses(ORG_A)).resolves.toEqual([])
  })
})
