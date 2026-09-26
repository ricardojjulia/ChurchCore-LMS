import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { setCoursePublicPreview } from '@/app/actions/org-settings'
import { covers } from '../covers'

covers('action:org-settings.setCoursePublicPreview')

// COUNCIL-2026-027 Prompt D — setCoursePublicPreview unit tests.
// Covers acceptance criteria: D3 (role restriction), D5 (no-content leak N/A here),
// and all rejection/success paths from Prompt D work items 7–9.
//
// Mocking conventions follow src/tests/unit/org-settings-auto-enroll.test.ts exactly:
// @/utils/supabase/server is mocked globally by src/tests/setup.ts — createClient() is
// overridden per test via vi.mocked(createClient).mockResolvedValue(...).
// @/utils/supabase/service is NOT globally mocked, so it gets a local vi.mock() here.
// Required env vars: none (pure unit test — no real Supabase connection).

const ORG_A   = 'org-aaaaaaaa-0000-0000-0000-000000000001'
const ORG_B   = 'org-bbbbbbbb-0000-0000-0000-000000000002'
const COURSE_A = 'course-aaaa-0000-0000-0000-000000000001'

// ── Service client mock ───────────────────────────────────────────────────────
// Handles the two phases of setCoursePublicPreview's service calls:
//  1. from('courses').select('id, org_id, status').eq(...).maybeSingle()  → initial lookup
//  2. from('courses').update({...}).eq(...)[.eq(...)].select('id')        → write
// createServiceClient() is called ONCE; the same `service` variable handles both.

function makeServiceClient({
  course,
  updateData = [{ id: COURSE_A }] as Array<{ id: string }> | null,
  updateError = null as { message: string } | null,
}: {
  course: { id: string; org_id: string; status: string } | null
  updateData?: Array<{ id: string }> | null
  updateError?: { message: string } | null
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateChain: any = {}
  updateChain.eq     = vi.fn().mockReturnValue(updateChain)
  updateChain.select = vi.fn().mockResolvedValue({ data: updateData, error: updateError })

  const updateFn = vi.fn().mockReturnValue(updateChain)

  // Honors .eq('org_id', ...) so the org-scoped lookup behaves like the DB:
  // a course outside the caller's org comes back as null.
  const lookupFilters: Array<[string, unknown]> = []
  // any: a self-referencing query-builder stub; typing it would mean
  // re-declaring Supabase's PostgrestFilterBuilder generics for a test double.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lookupChain: any = {}
  lookupChain.eq = vi.fn((column: string, value: unknown) => {
    lookupFilters.push([column, value])
    return lookupChain
  })
  lookupChain.maybeSingle = vi.fn(async () => {
    const orgFilter = lookupFilters.find(([column]) => column === 'org_id')
    const visible = course && (!orgFilter || orgFilter[1] === course.org_id)
    return { data: visible ? course : null, error: null }
  })

  const client = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(lookupChain),
      update: updateFn,
    }),
  }

  return { client, updateFn, updateChain, lookupChain }
}

// ── Session client mock ──────────────────────────────────────────────────────
// Mirrors the sessionClient() function in org-settings-auto-enroll.test.ts.

function sessionClient({
  authenticated   = true,
  isPlatformAdmin = false,
  callerOrgId,
  callerRole       = 'admin',
  profileMissing   = false,
}: {
  authenticated?:   boolean
  isPlatformAdmin?: boolean
  callerOrgId?:     string
  callerRole?:      string
  profileMissing?:  boolean
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: 'auth-caller' } : null },
        error: null,
      }),
    },
    rpc:  vi.fn().mockResolvedValue({ data: isPlatformAdmin, error: null }),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data:  profileMissing ? null : { org_id: callerOrgId, role: callerRole },
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

// ── Course not found ──────────────────────────────────────────────────────────

describe('setCoursePublicPreview — course not found', () => {
  it('returns an error when the course does not exist, no DB write attempted', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const { client, updateFn } = makeServiceClient({ course: null })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await setCoursePublicPreview(COURSE_A, true)
    expect(result).toEqual({ error: 'Course not found.' })
    expect(updateFn).not.toHaveBeenCalled()
  })
})

// ── Role rejection (D3 — never a teacher, even the owner) ────────────────────

describe('setCoursePublicPreview — role rejection', () => {
  it('student role → Forbidden, no DB write', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'student' }) as any,
    )
    const { client, updateFn } = makeServiceClient({
      course: { id: COURSE_A, org_id: ORG_A, status: 'published' },
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    await expect(setCoursePublicPreview(COURSE_A, true)).rejects.toThrow('Forbidden')
    expect(updateFn).not.toHaveBeenCalled()
  })

  it('teacher role in the correct org → Forbidden (D3: teacher cannot toggle, even if they own the course)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'teacher' }) as any,
    )
    const { client, updateFn } = makeServiceClient({
      course: { id: COURSE_A, org_id: ORG_A, status: 'published' },
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    await expect(setCoursePublicPreview(COURSE_A, true)).rejects.toThrow('Forbidden')
    expect(updateFn).not.toHaveBeenCalled()
  })

  it('unauthenticated caller → Unauthenticated, no DB write', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ authenticated: false }) as any,
    )
    const { client, updateFn } = makeServiceClient({
      course: { id: COURSE_A, org_id: ORG_A, status: 'published' },
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    await expect(setCoursePublicPreview(COURSE_A, true)).rejects.toThrow('Unauthenticated')
    expect(updateFn).not.toHaveBeenCalled()
  })

  it('unauthenticated caller gets the same error whether or not the course exists (no existence oracle)', async () => {
    for (const course of [null, { id: COURSE_A, org_id: ORG_A, status: 'draft' }]) {
      vi.mocked(createClient).mockResolvedValue(sessionClient({ authenticated: false }) as any)
      const { client, lookupChain } = makeServiceClient({ course })
      vi.mocked(createServiceClient).mockReturnValue(client as any)

      await expect(setCoursePublicPreview(COURSE_A, true)).rejects.toThrow('Unauthenticated')
      expect(lookupChain.maybeSingle).not.toHaveBeenCalled()
    }
  })
})

// ── Cross-org rejection ───────────────────────────────────────────────────────

describe('setCoursePublicPreview — cross-org rejection', () => {
  it('an org admin of Org B sees "not found" for an Org A course — indistinguishable from a missing one', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_B, callerRole: 'admin' }) as any,
    )
    const { client, updateFn } = makeServiceClient({
      course: { id: COURSE_A, org_id: ORG_A, status: 'published' },
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await setCoursePublicPreview(COURSE_A, true)
    expect(result).toEqual({ error: 'Course not found.' })
    expect(updateFn).not.toHaveBeenCalled()
  })
})

// ── Draft / non-published course (D3: enabling requires status = 'published') ─

describe('setCoursePublicPreview — non-published course rejection', () => {
  it('enabling preview on a draft course → specific error message, no DB write', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const { client, updateFn } = makeServiceClient({
      course: { id: COURSE_A, org_id: ORG_A, status: 'draft' },
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await setCoursePublicPreview(COURSE_A, true)
    expect(result).toEqual({ error: 'Only a published course can be marked as a public preview.' })
    expect(updateFn).not.toHaveBeenCalled()
  })

  it('enabling preview on an archived course → specific error message, no DB write', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const { client, updateFn } = makeServiceClient({
      course: { id: COURSE_A, org_id: ORG_A, status: 'archived' },
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await setCoursePublicPreview(COURSE_A, true)
    expect(result).toEqual({ error: 'Only a published course can be marked as a public preview.' })
    expect(updateFn).not.toHaveBeenCalled()
  })

  it('disabling preview on a draft course succeeds (no status check for disable)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const { client, updateFn } = makeServiceClient({
      course: { id: COURSE_A, org_id: ORG_A, status: 'draft' },
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await setCoursePublicPreview(COURSE_A, false)
    expect(result).toEqual({})
    expect(updateFn).toHaveBeenCalledWith({ is_public_preview: false })
  })
})

// ── Success paths ─────────────────────────────────────────────────────────────

describe('setCoursePublicPreview — success paths', () => {
  it('enabling on a published course succeeds for an org admin', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const { client, updateFn, updateChain } = makeServiceClient({
      course: { id: COURSE_A, org_id: ORG_A, status: 'published' },
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await setCoursePublicPreview(COURSE_A, true)
    expect(result).toEqual({})
    expect(updateFn).toHaveBeenCalledWith({ is_public_preview: true })
    // Enabling must filter the UPDATE to status='published' as the concurrent-unpublish guard.
    expect(updateChain.eq).toHaveBeenCalledWith('status', 'published')
  })

  it('enabling on a published course succeeds for an org manager (D3: manager may toggle)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'manager' }) as any,
    )
    const { client, updateFn } = makeServiceClient({
      course: { id: COURSE_A, org_id: ORG_A, status: 'published' },
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await setCoursePublicPreview(COURSE_A, true)
    expect(result).toEqual({})
    expect(updateFn).toHaveBeenCalledWith({ is_public_preview: true })
  })

  it('disabling preview on a published course succeeds, no status= filter on disable', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const { client, updateFn, updateChain } = makeServiceClient({
      course: { id: COURSE_A, org_id: ORG_A, status: 'published' },
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await setCoursePublicPreview(COURSE_A, false)
    expect(result).toEqual({})
    expect(updateFn).toHaveBeenCalledWith({ is_public_preview: false })
    // Disabling must NOT add the status='published' WHERE filter — it is always safe to disable.
    expect(updateChain.eq).not.toHaveBeenCalledWith('status', 'published')
  })

  it('a platform admin can enable preview on a course from any org', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: true, callerOrgId: ORG_B, callerRole: 'student' }) as any,
    )
    const { client } = makeServiceClient({
      course: { id: COURSE_A, org_id: ORG_A, status: 'published' },
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await setCoursePublicPreview(COURSE_A, true)
    expect(result).toEqual({})
  })
})

// ── Concurrent-unpublish race guard ──────────────────────────────────────────
// The UPDATE WHERE status='published' catches a concurrent unpublish even after
// the app-level check passed. When 0 rows are affected, the function must return
// the same error as the app-level check (Prompt B item 3).

describe('setCoursePublicPreview — concurrent-unpublish guard', () => {
  it('enable returns an error when the UPDATE affects 0 rows (course unpublished between check and write)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const { client } = makeServiceClient({
      course:     { id: COURSE_A, org_id: ORG_A, status: 'published' },
      updateData: [],  // 0 rows — the WHERE status='published' matched nothing
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await setCoursePublicPreview(COURSE_A, true)
    expect(result).toEqual({ error: 'Only a published course can be marked as a public preview.' })
  })
})

// ── DB error surfaces as generic message (no raw DB errors to client) ─────────

describe('setCoursePublicPreview — DB error handling', () => {
  it('a DB error from the update returns a generic error, not the raw DB message', async () => {
    vi.mocked(createClient).mockResolvedValue(
      sessionClient({ isPlatformAdmin: false, callerOrgId: ORG_A, callerRole: 'admin' }) as any,
    )
    const { client } = makeServiceClient({
      course:      { id: COURSE_A, org_id: ORG_A, status: 'published' },
      updateData:  null,
      updateError: { message: 'unexpected db error: constraint violation' },
    })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const result = await setCoursePublicPreview(COURSE_A, true)
    expect(result).toEqual({ error: 'Failed to update public preview setting.' })
    // The raw DB message must never reach the caller.
    expect(JSON.stringify(result)).not.toContain('constraint violation')
  })
})
