// @vitest-environment node
/**
 * Auto-Enroll on Registration e2e tests — COUNCIL-2026-026 Prompt D.4
 *
 * THE regression test for the live bug documented in COUNCIL-2026-026 and
 * fixed by supabase/migrations/20260919120000_auto_enroll_courses_settings.sql:
 * enrollSelf() (and, before this feature, any insert into enrollments) used to
 * omit org_id, a NOT NULL column with no DEFAULT and no BEFORE INSERT trigger
 * to fill it — every real call threw a constraint violation. This was
 * invisible because the pre-existing learning.test.ts fully mocks the
 * Supabase client (can't enforce real column constraints) and no e2e test
 * exercised enrollSelf()/enrollCore() against a real database.
 *
 * This file calls the real verifyAndEnroll() (src/app/join/actions.ts)
 * directly against the real local Supabase instance and asserts the resulting
 * `enrollments` row actually has org_id populated correctly — a mocked
 * assertion cannot catch this class of bug; only a real INSERT against a real
 * schema with the real trg_stamp_enrollment_org_id trigger (or its absence)
 * can. Run against a pre-Prompt-A schema, the auto-enroll call inside
 * verifyAndEnroll would throw (swallowed as best-effort), and this test's
 * enrollments-row assertion would fail with "no row found" — a real failure,
 * not a mock artifact.
 *
 * verifyAndEnroll() is invoked directly (not via HTTP through a running
 * `next dev` server) since it has no Next-request dependencies of its own —
 * only createServiceClient() (real service-role Supabase client) and a real
 * network call to Cloudflare Turnstile's siteverify endpoint, which is
 * satisfied here with Cloudflare's publicly documented "always passes" test
 * secret (1x0000000000000000000000000000000AA), not a mock.
 *
 * Required env vars:
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY,
 *   TEST_USER_PASSWORD
 *   TEST_USER_A_EMAIL — used only to resolve an existing admin's auth_id/uid
 *                       for created_by/owner_id on this file's own fixture
 *                       rows (defaults to the standard seeded
 *                       admin@test.churchcore.dev per supabase/seed.test.sql)
 *
 * Also requires NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for the
 * app's own createServiceClient() — these fall back to the TEST_* values
 * above when unset (identical in CI; see .github/workflows/e2e.yml).
 */

import { createClient as createRawClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const TEST_URL    = process.env.TEST_SUPABASE_URL              ?? ''
const ANON_KEY    = process.env.TEST_SUPABASE_ANON_KEY         ?? ''
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? ''
const PASSWORD    = process.env.TEST_USER_PASSWORD             ?? ''
const FIXTURE_ADMIN_EMAIL = process.env.TEST_USER_A_EMAIL ?? 'admin@test.churchcore.dev'

if (!TEST_URL || !ANON_KEY || !SERVICE_KEY || !PASSWORD) {
  const missing = [
    !TEST_URL    && 'TEST_SUPABASE_URL',
    !ANON_KEY    && 'TEST_SUPABASE_ANON_KEY',
    !SERVICE_KEY && 'TEST_SUPABASE_SERVICE_ROLE_KEY',
    !PASSWORD    && 'TEST_USER_PASSWORD',
  ].filter(Boolean).join(', ')
  throw new Error(`Auto-enroll e2e: missing required env vars — ${missing}`)
}

process.env.NEXT_PUBLIC_SUPABASE_URL  ??= TEST_URL
process.env.SUPABASE_SERVICE_ROLE_KEY ??= SERVICE_KEY
// Cloudflare Turnstile's publicly documented "always passes" test secret —
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
process.env.TURNSTILE_SECRET_KEY ??= '1x0000000000000000000000000000000AA'

// ── Deterministic fixture UUIDs (own namespace — never collides with
//    supabase/seed.test.sql's 0010/0011/0020/0021 series) ─────────────────────
const ORG_ID            = '00000000-0000-0000-0090-000000000001'
const TERM_ID            = '00000000-0000-0000-0090-000000000002'
const BLUEPRINT_OPEN_ID  = '00000000-0000-0000-0090-000000000003'
const BLUEPRINT_COHORT_ID = '00000000-0000-0000-0090-000000000004'
const SECTION_OPEN_ID    = '00000000-0000-0000-0090-000000000005'
const SECTION_COHORT_ID  = '00000000-0000-0000-0090-000000000006'
const COURSE_OPEN_ID     = '00000000-0000-0000-0090-000000000007'
const COURSE_COHORT_ID   = '00000000-0000-0000-0090-000000000008'

const NEW_STUDENT_EMAIL = `e2e-autoenroll-${Date.now()}@test.churchcore.dev`

let svc: SupabaseClient
let newStudentAuthId: string | null = null
let newStudentUid: string | null = null

async function wipeFixtureRows() {
  // FK-safe order. Never touches auth.users here — that's handled separately.
  await svc.from('enrollments').delete().in('course_id', [COURSE_OPEN_ID, COURSE_COHORT_ID])
  await svc.from('courses').delete().in('id', [COURSE_OPEN_ID, COURSE_COHORT_ID])
  await svc.from('course_sections').delete().in('id', [SECTION_OPEN_ID, SECTION_COHORT_ID])
  await svc.from('course_blueprints').delete().in('id', [BLUEPRINT_OPEN_ID, BLUEPRINT_COHORT_ID])
  await svc.from('academic_terms').delete().eq('id', TERM_ID)
  await svc.from('organizations').delete().eq('id', ORG_ID)
}

beforeAll(async () => {
  svc = createRawClient(TEST_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Resolve an existing seeded admin to use as created_by/owner_id.
  const { data: fixtureAdmin, error: adminErr } = await svc
    .from('profiles')
    .select('auth_id, uid')
    .eq('email', FIXTURE_ADMIN_EMAIL)
    .single()
  if (adminErr || !fixtureAdmin) {
    throw new Error(`Auto-enroll e2e: could not resolve fixture admin ${FIXTURE_ADMIN_EMAIL}: ${adminErr?.message}`)
  }
  const adminAuthId = fixtureAdmin.auth_id as string
  const adminUid    = fixtureAdmin.uid as string

  // Clean up any leftover rows from a previous, possibly-crashed run first —
  // makes this file safe to re-run locally without manual DB resets.
  await wipeFixtureRows()

  // ── Organization, configured with BOTH an open and a cohort_gated auto-enroll course ──
  const { error: orgErr } = await svc.from('organizations').insert({
    id: ORG_ID,
    name: 'Test Church AutoEnroll E2E',
    slug: `autoenroll-e2e-${Date.now()}`,
    status: 'active',
    plan: 'free',
    settings: { auto_enroll_courses: [COURSE_OPEN_ID, COURSE_COHORT_ID] },
  })
  if (orgErr) throw new Error(`Failed to seed fixture org: ${orgErr.message}`)

  const { error: termErr } = await svc.from('academic_terms').insert({
    id: TERM_ID,
    term_name: 'E2E AutoEnroll Term',
    term_code: `E2E-AUTOENROLL-TERM-${Date.now()}`,
    type: 'semester',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    config: {},
    is_active: true,
    created_by: adminAuthId,
    org_id: ORG_ID,
  })
  if (termErr) throw new Error(`Failed to seed fixture term: ${termErr.message}`)

  const { error: bpErr } = await svc.from('course_blueprints').insert([
    {
      id: BLUEPRINT_OPEN_ID,
      course_code: `E2E-AUTOENROLL-OPEN-${Date.now()}`,
      title: 'E2E AutoEnroll Open Blueprint',
      is_active: true,
      created_by: adminAuthId,
      org_id: ORG_ID,
    },
    {
      id: BLUEPRINT_COHORT_ID,
      course_code: `E2E-AUTOENROLL-COHORT-${Date.now()}`,
      title: 'E2E AutoEnroll Cohort Blueprint',
      is_active: true,
      created_by: adminAuthId,
      org_id: ORG_ID,
    },
  ])
  if (bpErr) throw new Error(`Failed to seed fixture blueprints: ${bpErr.message}`)

  const { error: sectionErr } = await svc.from('course_sections').insert([
    {
      id: SECTION_OPEN_ID,
      blueprint_id: BLUEPRINT_OPEN_ID,
      term_id: TERM_ID,
      section_code: 'OPEN-1',
      delivery_format: 'self_paced',
      enrollment_type: 'open',
      is_active: true,
      created_by: adminAuthId,
      org_id: ORG_ID,
    },
    {
      id: SECTION_COHORT_ID,
      blueprint_id: BLUEPRINT_COHORT_ID,
      term_id: TERM_ID,
      section_code: 'COHORT-1',
      delivery_format: 'self_paced',
      enrollment_type: 'cohort_gated',
      is_active: true,
      created_by: adminAuthId,
      org_id: ORG_ID,
    },
  ])
  if (sectionErr) throw new Error(`Failed to seed fixture sections: ${sectionErr.message}`)

  const { error: courseErr } = await svc.from('courses').insert([
    {
      id: COURSE_OPEN_ID,
      org_id: ORG_ID,
      title: 'E2E AutoEnroll Open Course',
      status: 'published',
      owner_id: adminUid,
      blueprint_id: BLUEPRINT_OPEN_ID,
    },
    {
      id: COURSE_COHORT_ID,
      org_id: ORG_ID,
      title: 'E2E AutoEnroll Cohort Course',
      status: 'published',
      owner_id: adminUid,
      blueprint_id: BLUEPRINT_COHORT_ID,
    },
  ])
  if (courseErr) throw new Error(`Failed to seed fixture courses: ${courseErr.message}`)
})

afterAll(async () => {
  try {
    if (newStudentAuthId) {
      await svc.from('enrollments').delete().eq('user_id', newStudentUid ?? '')
      await svc.from('profile_roles').delete().eq('auth_id', newStudentAuthId)
      await svc.from('profiles').delete().eq('auth_id', newStudentAuthId)
      await svc.auth.admin.deleteUser(newStudentAuthId)
    }
  } catch (e) {
    console.warn('afterAll: failed to clean up the new student —', e)
  }

  try {
    await wipeFixtureRows()
  } catch (e) {
    console.warn('afterAll: failed to clean up fixture org/course rows —', e)
  }
})

describe('auto-enroll on registration (real Supabase — org_id regression)', () => {
  it('registers successfully, auto-enrolls into the open course with org_id correctly stamped, and silently skips the cohort_gated course', async () => {
    const { verifyAndEnroll } = await import('@/app/join/actions')

    const result = await verifyAndEnroll({
      orgId: ORG_ID,
      email: NEW_STUDENT_EMAIL,
      password: PASSWORD,
      displayName: 'E2E AutoEnroll Student',
      turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
    })

    // Registration itself must succeed — a gated auto-enroll course must never
    // surface as a registration error (COUNCIL-2026-026 D4).
    expect(result).toEqual({})

    const { data: newProfile, error: profileErr } = await svc
      .from('profiles')
      .select('uid, auth_id, org_id')
      .eq('email', NEW_STUDENT_EMAIL)
      .single()
    expect(profileErr).toBeNull()
    expect(newProfile).not.toBeNull()
    expect(newProfile!.org_id).toBe(ORG_ID)

    newStudentAuthId = newProfile!.auth_id as string
    newStudentUid    = newProfile!.uid as string

    // ── THE regression assertion ──────────────────────────────────────────
    // A real enrollments row for the open course, with org_id populated by
    // trg_stamp_enrollment_org_id (migration 20260919120000). Pre-Prompt-A,
    // this insert would have thrown a NOT NULL violation inside enrollCore()
    // (swallowed by verifyAndEnroll's best-effort try/catch), and this row
    // simply would not exist.
    const { data: openEnrollment, error: openErr } = await svc
      .from('enrollments')
      .select('org_id, transit_status, progress_percent')
      .eq('user_id', newStudentUid)
      .eq('course_id', COURSE_OPEN_ID)
      .single()

    expect(openErr).toBeNull()
    expect(openEnrollment).not.toBeNull()
    expect(openEnrollment!.org_id).toBe(ORG_ID)
    expect(openEnrollment!.transit_status).toBe('not_started')
    expect(Number(openEnrollment!.progress_percent)).toBe(0)

    // ── The cohort_gated course must be skipped, not enrolled ──────────────
    const { data: cohortEnrollment, error: cohortErr } = await svc
      .from('enrollments')
      .select('id')
      .eq('user_id', newStudentUid)
      .eq('course_id', COURSE_COHORT_ID)
      .maybeSingle()

    expect(cohortErr).toBeNull()
    expect(cohortEnrollment).toBeNull()
  })
})
