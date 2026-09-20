// @vitest-environment node
/**
 * Auto-Enroll Admin e2e tests — COUNCIL-2026-026 Prompt D.4
 *
 * Full round-trip through the real org-settings.ts Server Actions
 * (getAutoEnrollCourses / addAutoEnrollCourse / removeAutoEnrollCourse)
 * against the real local Supabase instance: add a course, confirm it appears,
 * remove it, confirm it's gone.
 *
 * These Server Actions are imported and invoked directly (not via HTTP through
 * a running `next dev` server, unlike admin-health-page.test.ts) because they
 * don't depend on anything Next-request-specific beyond two things this file
 * stubs out narrowly, without touching any real business logic:
 *
 *  - next/headers' cookies() normally only works inside an actual Next.js
 *    request scope. It's mocked here to read from a cookie jar populated by a
 *    REAL sign-in (src/tests/e2e/test-session.ts, same helper
 *    admin-health-page.test.ts uses over HTTP) — so assertOrgAdminOrPlatformAdmin()
 *    still does a real supabase.auth.getUser() round trip against the real
 *    local Auth server using a real session, it's just fed cookies directly
 *    instead of via an HTTP Cookie header.
 *  - next/cache's revalidatePath() throws ("Invariant: static generation store
 *    missing") when called outside a real Next request/render — confirmed
 *    empirically while writing this test. It's a cache-invalidation side
 *    effect that's irrelevant to server-side correctness, so it's stubbed to
 *    a no-op rather than skipping this test file's real-Supabase coverage.
 *
 * Required env vars:
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY,
 *   TEST_USER_PASSWORD
 *   TEST_USER_A_EMAIL — an org admin for Org A (defaults to the standard
 *                       seeded admin@test.churchcore.dev, org A, per
 *                       supabase/seed.test.sql)
 *
 * Also requires NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
 * SUPABASE_SERVICE_ROLE_KEY for the app's own createClient()/createServiceClient()
 * — these fall back to the TEST_* values above when unset (they're identical
 * in CI; see .github/workflows/e2e.yml).
 */

import { createClient as createRawClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { signInTestUser } from './test-session'

const TEST_URL    = process.env.TEST_SUPABASE_URL              ?? ''
const ANON_KEY    = process.env.TEST_SUPABASE_ANON_KEY         ?? ''
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? ''
const PASSWORD    = process.env.TEST_USER_PASSWORD             ?? ''
const ORG_A_ADMIN_EMAIL = process.env.TEST_USER_A_EMAIL ?? 'admin@test.churchcore.dev'

if (!TEST_URL || !ANON_KEY || !SERVICE_KEY || !PASSWORD) {
  const missing = [
    !TEST_URL    && 'TEST_SUPABASE_URL',
    !ANON_KEY    && 'TEST_SUPABASE_ANON_KEY',
    !SERVICE_KEY && 'TEST_SUPABASE_SERVICE_ROLE_KEY',
    !PASSWORD    && 'TEST_USER_PASSWORD',
  ].filter(Boolean).join(', ')
  throw new Error(`Auto-enroll admin e2e: missing required env vars — ${missing}`)
}

// The app's own env.ts / supabase client wrappers read these exact names.
process.env.NEXT_PUBLIC_SUPABASE_URL      ??= TEST_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY     ??= SERVICE_KEY

// ── Org A (seeded, supabase/seed.test.sql) + a real published course ───────────
const ORG_A    = '00000000-0000-0000-0010-000000000001'
const COURSE_ID = '00000000-0000-0000-0011-000000000003' // "Standalone Course", org A, published

// ── next/headers mock — fed by a real signed-in session ─────────────────────────
const cookieState = vi.hoisted(() => ({ cookies: [] as { name: string; value: string }[] }))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => cookieState.cookies,
    get:    (name: string) => cookieState.cookies.find((c) => c.name === name),
    set:    () => {},
  }),
}))

// ── next/cache mock — revalidatePath() requires a real Next request scope ──────
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag:  vi.fn(),
}))

let svc: SupabaseClient
let originalSettings: Record<string, unknown> | null = null

beforeAll(async () => {
  svc = createRawClient(TEST_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Real sign-in as the Org A admin — the resulting cookies are handed to the
  // mocked next/headers so the Server Actions' own createClient() builds a
  // real, authenticated session-bound Supabase client.
  const session = await signInTestUser(TEST_URL, ANON_KEY, ORG_A_ADMIN_EMAIL, PASSWORD)
  cookieState.cookies = session.cookieHeader
    .split('; ')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=')
      return { name: pair.slice(0, eq), value: pair.slice(eq + 1) }
    })

  // Snapshot Org A's current settings so this run can restore them exactly,
  // regardless of what auto_enroll_courses held before (shared seed fixture).
  const { data, error } = await svc.from('organizations').select('settings').eq('id', ORG_A).single()
  if (error) throw new Error(`Failed to read Org A settings: ${error.message}`)
  originalSettings = data?.settings ?? {}
})

afterAll(async () => {
  try {
    await svc.from('organizations').update({ settings: originalSettings }).eq('id', ORG_A)
  } catch (e) {
    console.warn('afterAll: failed to restore Org A settings —', e)
  }
})

describe('auto-enroll admin round trip (Server Actions, real Supabase)', () => {
  it('add → appears → remove → gone', async () => {
    const { getAutoEnrollCourses, addAutoEnrollCourse, removeAutoEnrollCourse } =
      await import('@/app/actions/org-settings')

    // Start from a known-clean state for this course id (idempotent re-runs).
    const before = await getAutoEnrollCourses(ORG_A)
    expect(before).not.toContain(COURSE_ID)

    const addResult = await addAutoEnrollCourse(ORG_A, COURSE_ID)
    expect(addResult).toEqual({})

    const afterAdd = await getAutoEnrollCourses(ORG_A)
    expect(afterAdd).toContain(COURSE_ID)

    const removeResult = await removeAutoEnrollCourse(ORG_A, COURSE_ID)
    expect(removeResult).toEqual({})

    const afterRemove = await getAutoEnrollCourses(ORG_A)
    expect(afterRemove).not.toContain(COURSE_ID)
    // Full round trip — back to exactly where we started.
    expect(afterRemove).toEqual(before)
  })

  it('adding the same course twice is idempotent (second call is a no-op, not a duplicate)', async () => {
    const { getAutoEnrollCourses, addAutoEnrollCourse, removeAutoEnrollCourse } =
      await import('@/app/actions/org-settings')

    await addAutoEnrollCourse(ORG_A, COURSE_ID)
    await addAutoEnrollCourse(ORG_A, COURSE_ID)

    const list = await getAutoEnrollCourses(ORG_A)
    expect(list.filter((id) => id === COURSE_ID)).toHaveLength(1)

    // Clean up so this test doesn't leak state into the next run.
    await removeAutoEnrollCourse(ORG_A, COURSE_ID)
    const after = await getAutoEnrollCourses(ORG_A)
    expect(after).not.toContain(COURSE_ID)
  })
})
