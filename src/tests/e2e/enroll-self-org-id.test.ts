// @vitest-environment node
/**
 * enrollSelf() authenticated-role org_id regression — COUNCIL-2026-026.
 *
 * auto-enroll.test.ts already proves the org_id-stamping trigger
 * (stamp_enrollment_org_id, 20260920073000_auto_enroll_courses_settings.sql)
 * works for the registration-time path, which inserts via the service_role
 * client — a role that BYPASSES RLS entirely (BYPASSRLS), including on the
 * trigger's own SELECT against profile_roles.
 *
 * That does NOT prove the trigger works for enrollSelf() (the original path
 * the bug was found in), which inserts as the `authenticated` Postgres role —
 * a role that is subject to RLS on every table the SECURITY INVOKER trigger
 * touches, including profile_roles. This file closes that gap: it signs in
 * as a real seeded student, calls the real enrollSelf() Server Action, and
 * asserts a real enrollments row appears with org_id correctly populated —
 * proving the trigger's `SELECT org_id FROM profile_roles WHERE uid =
 * NEW.user_id` succeeds under RLS as `authenticated`, not just under a
 * role that bypasses RLS.
 *
 * Cookie/cache mocking follows the exact pattern established in
 * auto-enroll-admin.test.ts — see that file's header comment for the full
 * rationale; not repeated here.
 *
 * Required env vars:
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY,
 *   TEST_USER_PASSWORD
 *   TEST_STUDENT_EMAIL — defaults to the standard seeded
 *                        student@test.churchcore.dev (Org A)
 */

import { createClient as createRawClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { signInTestUser } from './test-session'

const TEST_URL    = process.env.TEST_SUPABASE_URL              ?? ''
const ANON_KEY    = process.env.TEST_SUPABASE_ANON_KEY         ?? ''
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? ''
const PASSWORD    = process.env.TEST_USER_PASSWORD             ?? ''
const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL ?? 'student@test.churchcore.dev'

if (!TEST_URL || !ANON_KEY || !SERVICE_KEY || !PASSWORD) {
  const missing = [
    !TEST_URL    && 'TEST_SUPABASE_URL',
    !ANON_KEY    && 'TEST_SUPABASE_ANON_KEY',
    !SERVICE_KEY && 'TEST_SUPABASE_SERVICE_ROLE_KEY',
    !PASSWORD    && 'TEST_USER_PASSWORD',
  ].filter(Boolean).join(', ')
  throw new Error(`enrollSelf org_id e2e: missing required env vars — ${missing}`)
}

process.env.NEXT_PUBLIC_SUPABASE_URL      ??= TEST_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY     ??= SERVICE_KEY

// Own UUID namespace — never collides with supabase/seed.test.sql's fixtures.
const ORG_A          = '00000000-0000-0000-0010-000000000001' // seeded org, matches the seeded student
const COURSE_ID       = '00000000-0000-0000-0091-000000000001'
const BLUEPRINT_ID    = '00000000-0000-0000-0091-000000000002'
const SECTION_ID      = '00000000-0000-0000-0091-000000000003'
const TERM_ID          = '00000000-0000-0000-0091-000000000004'

const cookieState = vi.hoisted(() => ({ cookies: [] as { name: string; value: string }[] }))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => cookieState.cookies,
    get:    (name: string) => cookieState.cookies.find((c) => c.name === name),
    set:    () => {},
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag:  vi.fn(),
}))

let svc: SupabaseClient
let studentUid: string

async function wipeFixtureRows() {
  await svc.from('enrollments').delete().eq('course_id', COURSE_ID)
  await svc.from('courses').delete().eq('id', COURSE_ID)
  await svc.from('course_sections').delete().eq('id', SECTION_ID)
  await svc.from('course_blueprints').delete().eq('id', BLUEPRINT_ID)
  await svc.from('academic_terms').delete().eq('id', TERM_ID)
}

beforeAll(async () => {
  svc = createRawClient(TEST_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: studentProfile, error: studentErr } = await svc
    .from('profiles')
    .select('uid, auth_id')
    .eq('email', STUDENT_EMAIL)
    .single()
  if (studentErr || !studentProfile) {
    throw new Error(`enrollSelf org_id e2e: could not resolve seeded student ${STUDENT_EMAIL}: ${studentErr?.message}`)
  }
  studentUid = studentProfile.uid as string

  const session = await signInTestUser(TEST_URL, ANON_KEY, STUDENT_EMAIL, PASSWORD)
  cookieState.cookies = session.cookieHeader
    .split('; ')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=')
      return { name: pair.slice(0, eq), value: pair.slice(eq + 1) }
    })

  await wipeFixtureRows()

  const { error: termErr } = await svc.from('academic_terms').insert({
    id: TERM_ID,
    term_name: 'E2E EnrollSelf Term',
    term_code: `E2E-ENROLLSELF-TERM-${Date.now()}`,
    type: 'semester',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    config: {},
    is_active: true,
    created_by: studentProfile.auth_id,
    org_id: ORG_A,
  })
  if (termErr) throw new Error(`Failed to seed fixture term: ${termErr.message}`)

  const { error: bpErr } = await svc.from('course_blueprints').insert({
    id: BLUEPRINT_ID,
    course_code: `E2E-ENROLLSELF-${Date.now()}`,
    title: 'E2E EnrollSelf Blueprint',
    is_active: true,
    created_by: studentProfile.auth_id,
    org_id: ORG_A,
  })
  if (bpErr) throw new Error(`Failed to seed fixture blueprint: ${bpErr.message}`)

  const { error: sectionErr } = await svc.from('course_sections').insert({
    id: SECTION_ID,
    blueprint_id: BLUEPRINT_ID,
    term_id: TERM_ID,
    section_code: 'ENROLLSELF-1',
    delivery_format: 'self_paced',
    enrollment_type: 'open',
    is_active: true,
    created_by: studentProfile.auth_id,
    org_id: ORG_A,
  })
  if (sectionErr) throw new Error(`Failed to seed fixture section: ${sectionErr.message}`)

  const { error: courseErr } = await svc.from('courses').insert({
    id: COURSE_ID,
    org_id: ORG_A,
    title: 'E2E EnrollSelf Course',
    status: 'published',
    owner_id: studentUid,
    blueprint_id: BLUEPRINT_ID,
  })
  if (courseErr) throw new Error(`Failed to seed fixture course: ${courseErr.message}`)
})

afterAll(async () => {
  try {
    await wipeFixtureRows()
  } catch (e) {
    console.warn('afterAll: failed to clean up fixture rows —', e)
  }
})

describe('enrollSelf() — authenticated-role org_id regression (real Supabase)', () => {
  it('inserts a real enrollments row with org_id correctly stamped under RLS as the authenticated role', async () => {
    const { enrollSelf } = await import('@/app/actions/learning')

    const result = await enrollSelf(COURSE_ID)
    expect(result).toEqual({})

    const { data: enrollment, error } = await svc
      .from('enrollments')
      .select('org_id, user_id, transit_status')
      .eq('user_id', studentUid)
      .eq('course_id', COURSE_ID)
      .single()

    expect(error).toBeNull()
    expect(enrollment).not.toBeNull()
    expect(enrollment!.org_id).toBe(ORG_A)
    expect(enrollment!.transit_status).toBe('not_started')
  })
})
