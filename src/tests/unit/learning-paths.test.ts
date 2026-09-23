// COUNCIL-2026-029: Learning Paths — unit tests
// Covers: auth enforcement (student/anonymous rejection), validation,
// org-boundary enforcement, and addCourseToPath business rules.
//
// Follows the same mocking conventions as set-course-public-preview.test.ts:
// @/utils/supabase/server is globally mocked by src/tests/setup.ts; we override
// createClient per test via vi.mocked(createClient).mockResolvedValue(...).

import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import {
  createLearningPath,
  updateLearningPath,
  deleteLearningPath,
  addCourseToPath,
  removeCourseFromPath,
  reorderPathCourses,
  getLearningPathsForLearner,
} from '@/app/actions/learning-paths'

// ── Constants ────────────────────────────────────────────────────────────────
const ORG_A   = 'org-aaaaaaaa-0000-0000-0000-000000000001'
const ORG_B   = 'org-bbbbbbbb-0000-0000-0000-000000000002'
const PATH_A  = 'path-aaaa-0000-0000-0000-000000000001'
const COURSE_A = 'course-aaaa-0000-0000-0000-000000000001'
const USER_ID = 'user-0000-0000-0000-000000000001'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeClient({
  role = 'admin',
  orgId = ORG_A,
  isPlatformAdmin = false,
  pathData = { org_id: ORG_A } as { org_id: string } | null,
  courseData = null as { id: string; org_id: string; status: string } | null,
  insertError = null as { message: string } | null,
  updateError = null as { message: string } | null,
  deleteError = null as { message: string } | null,
  existingPathCourses = [] as Array<{ course_id: string }>,
  maxSortOrder = null as { sort_order: number } | null,
}) {
  // Flexible mock: each from() call resolves based on which table is queried.
  // We use a call-order approach for simplicity.
  let fromCallCount = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeChain = (resolvedData: any, resolvedError: any = null): any => ({
    select:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    single:      vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError }),
    maybeSingle: vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError }),
    insert:      vi.fn().mockResolvedValue({ data: resolvedData, error: insertError }),
    update:      vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: resolvedData, error: updateError }) }) }),
    delete:      vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: resolvedData, error: deleteError }) }),
    order:       vi.fn().mockReturnThis(),
    limit:       vi.fn().mockReturnThis(),
    in:          vi.fn().mockReturnThis(),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromFn = vi.fn().mockImplementation((_table: string): any => {
    fromCallCount++
    // The call order in the actions:
    // createLearningPath:     1=profile_roles (role check), 2=insert learning_paths
    // updateLearningPath:     1=learning_paths (get org_id), 2=profile_roles (role), 3=update
    // deleteLearningPath:     1=learning_paths (get org_id), 2=profile_roles (role), 3=delete
    // addCourseToPath:        1=learning_paths (get org_id), 2=profile_roles (role), 3=courses, 4=max sort, 5=insert lpc
    const profileData = { org_id: orgId, role }
    const pathCourses = { data: existingPathCourses, error: null }
    // Return relevant data per table name
    if (_table === 'profile_roles') return makeChain(profileData)
    if (_table === 'learning_paths') return makeChain(pathData)
    if (_table === 'courses') return makeChain(courseData)
    if (_table === 'learning_path_courses') {
      // For the max sort_order query (single) vs. list query vs. insert
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select:      vi.fn().mockReturnThis(),
        eq:          vi.fn().mockReturnThis(),
        order:       vi.fn().mockReturnThis(),
        limit:       vi.fn().mockReturnThis(),
        single:      vi.fn().mockResolvedValue({ data: maxSortOrder, error: null }),
        insert:      vi.fn().mockResolvedValue({ data: null, error: insertError }),
        delete:      vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: deleteError }) }) }),
        in:          vi.fn().mockReturnThis(),
      }
      // For list queries (no single()), resolve from pathCourses
      chain.select.mockReturnValue({
        ...chain,
        single: vi.fn().mockResolvedValue({ data: maxSortOrder, error: null }),
        // Resolve the chain as the full list
        then: (_resolve: (v: typeof pathCourses) => void) => Promise.resolve(pathCourses).then(_resolve),
      })
      return chain
    }
    return makeChain(null)
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: role === 'anon' ? null : { id: USER_ID } },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: isPlatformAdmin, error: null }),
    from: fromFn,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── createLearningPath ────────────────────────────────────────────────────────

describe('createLearningPath', () => {
  it('rejects unauthenticated caller', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const result = await createLearningPath(ORG_A, { title: 'Test' })
    expect(result.error).toMatch(/unauthenticated/i)
    expect(result.data).toBeNull()
  })

  it('rejects student role', async () => {
    vi.mocked(createClient).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeClient({ role: 'student' }) as any
    )
    const result = await createLearningPath(ORG_A, { title: 'Test' })
    expect(result.error).toMatch(/forbidden/i)
  })

  it('rejects empty title', async () => {
    const result = await createLearningPath(ORG_A, { title: '' })
    expect(result.error).toMatch(/title is required/i)
  })

  it('rejects title over 200 chars', async () => {
    const result = await createLearningPath(ORG_A, { title: 'x'.repeat(201) })
    expect(result.error).toMatch(/200 characters/i)
  })

  it('succeeds for admin role', async () => {
    const mockPath = { id: PATH_A, org_id: ORG_A, title: 'New Path', description: null, is_published: false, cover_image_url: null, created_at: '', updated_at: '' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = makeClient({ role: 'admin' }) as any
    // Override learning_paths insert to return a path
    const insertChain = {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockPath, error: null }),
        }),
      }),
    }
    const origFrom = client.from
    client.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'learning_paths') return insertChain
      return origFrom(table)
    })
    vi.mocked(createClient).mockResolvedValue(client)
    const result = await createLearningPath(ORG_A, { title: 'New Path' })
    expect(result.error).toBeNull()
    expect(result.data?.id).toBe(PATH_A)
  })
})

// ── updateLearningPath ────────────────────────────────────────────────────────

describe('updateLearningPath', () => {
  it('rejects cross-org call (wrong org)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeClient({ orgId: ORG_B, pathData: { org_id: ORG_A } }) as any
    )
    const result = await updateLearningPath(PATH_A, { title: 'Hacked' })
    expect(result.error).toMatch(/forbidden/i)
  })

  it('rejects empty title', async () => {
    const result = await updateLearningPath(PATH_A, { title: '' })
    expect(result.error).toMatch(/title is required/i)
  })
})

// ── deleteLearningPath ────────────────────────────────────────────────────────

describe('deleteLearningPath', () => {
  it('rejects cross-org delete', async () => {
    vi.mocked(createClient).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeClient({ orgId: ORG_B, pathData: { org_id: ORG_A } }) as any
    )
    const result = await deleteLearningPath(PATH_A)
    expect(result.error).toMatch(/forbidden/i)
  })

  it('succeeds for the owning org admin (learning_path_courses cascades via ON DELETE CASCADE at the DB layer, not application code)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeClient({ role: 'admin', orgId: ORG_A, pathData: { org_id: ORG_A }, deleteError: null }) as any
    )
    const result = await deleteLearningPath(PATH_A)
    expect(result.error).toBeNull()
  })
})

// ── addCourseToPath ────────────────────────────────────────────────────────────

describe('addCourseToPath', () => {
  it('rejects draft course (only published allowed)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeClient({
        pathData: { org_id: ORG_A },
        courseData: { id: COURSE_A, org_id: ORG_A, status: 'draft' },
      }) as any
    )
    const result = await addCourseToPath(PATH_A, COURSE_A)
    expect(result.error).toMatch(/published/i)
  })

  it('rejects course from different org', async () => {
    vi.mocked(createClient).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeClient({
        pathData: { org_id: ORG_A },
        courseData: { id: COURSE_A, org_id: ORG_B, status: 'published' },
      }) as any
    )
    const result = await addCourseToPath(PATH_A, COURSE_A)
    expect(result.error).toMatch(/organization/i)
  })
})

// ── removeCourseFromPath ────────────────────────────────────────────────────────

describe('removeCourseFromPath', () => {
  it('rejects cross-org call', async () => {
    vi.mocked(createClient).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeClient({ orgId: ORG_B, pathData: { org_id: ORG_A } }) as any
    )
    const result = await removeCourseFromPath(PATH_A, COURSE_A)
    expect(result.error).toMatch(/forbidden/i)
  })

  it('succeeds for the owning org admin', async () => {
    vi.mocked(createClient).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeClient({ role: 'admin', orgId: ORG_A, pathData: { org_id: ORG_A } }) as any
    )
    const result = await removeCourseFromPath(PATH_A, COURSE_A)
    expect(result.error).toBeNull()
  })
})

// ── reorderPathCourses ────────────────────────────────────────────────────────

describe('reorderPathCourses', () => {
  it('returns no error for empty list (no-op)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeClient({ pathData: { org_id: ORG_A } }) as any
    )
    const result = await reorderPathCourses(PATH_A, [])
    expect(result.error).toBeNull()
  })

  it('rejects when a provided course ID does not belong to the path — no write attempted', async () => {
    vi.mocked(createClient).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeClient({
        role: 'admin',
        orgId: ORG_A,
        pathData: { org_id: ORG_A },
        existingPathCourses: [{ course_id: COURSE_A }],
      }) as any
    )
    const result = await reorderPathCourses(PATH_A, [COURSE_A, 'course-not-in-path'])
    expect(result.error).toMatch(/not in this path/i)
  })
})

// ── getLearningPathsForLearner ──────────────────────────────────────────────────
// Regression test for the completedCount bug found in PR review: course_certificates.user_id
// references profiles.uid (the domain UID), not auth.users.id. This proves the fix resolves
// the domain UID via profile_roles before querying certificates, rather than using the raw
// auth id (which would always return zero matches, since domain uid != auth id in this schema).

describe('getLearningPathsForLearner', () => {
  it('resolves the domain uid via profile_roles and computes completedCount from course_certificates', async () => {
    const AUTH_ID = 'auth-0000-0000-0000-000000000099'
    const DOMAIN_UID = 'uid-0000-0000-0000-000000000099'

    const path = {
      id: PATH_A, org_id: ORG_A, title: 'Path', description: null,
      is_published: true, cover_image_url: null, created_at: '', updated_at: '',
      learning_path_courses: [
        { id: 'lpc-1', path_id: PATH_A, course_id: COURSE_A, sort_order: 0, course: { id: COURSE_A, title: 'Course A', description: null, status: 'published' } },
      ],
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null }) },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profile_roles') {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { uid: DOMAIN_UID }, error: null }) }
        }
        if (table === 'learning_paths') {
          return {
            select: vi.fn().mockReturnThis(),
            eq:     vi.fn().mockReturnThis(),
            order:  vi.fn().mockResolvedValue({ data: [path], error: null }),
          }
        }
        if (table === 'course_certificates') {
          return {
            select: vi.fn().mockReturnThis(),
            eq:     vi.fn().mockImplementation((column: string, value: string) => {
              // Assert the query filters by the resolved domain uid, not the raw auth id
              expect(column).toBe('user_id')
              expect(value).toBe(DOMAIN_UID)
              return Promise.resolve({ data: [{ course_id: COURSE_A }], error: null })
            }),
          }
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [], error: null }) }
      }),
    }
    vi.mocked(createClient).mockResolvedValue(client)

    const result = await getLearningPathsForLearner(ORG_A)
    expect(result).toHaveLength(1)
    expect(result[0].completedCount).toBe(1)
    expect(result[0].totalCount).toBe(1)
  })

  it('returns an empty array when the caller has no profile_roles row', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'auth-x' } }, error: null }) },
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    }
    vi.mocked(createClient).mockResolvedValue(client)

    const result = await getLearningPathsForLearner(ORG_A)
    expect(result).toEqual([])
  })
})
