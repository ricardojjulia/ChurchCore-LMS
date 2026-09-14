// @vitest-environment node
/**
 * Enrollment Bridge Integration Tests
 * ADR-2025-004 GAP-002 — Academic bridge trigger + backfill
 *
 * Verifies that:
 *   1. Inserting a direct_enrollment with status='active' automatically creates
 *      a corresponding row in enrollments (bridge trigger, migration 040).
 *   2. Updating a direct_enrollment to status='withdrawn' propagates the
 *      withdrawal to enrollments (sync trigger, migration 040).
 *   3. Migration 043 backfill is idempotent (re-running produces no duplicates).
 *   4. The bridge does NOT create enrollments for courses without a blueprint_id.
 *
 * Prerequisites:
 *   - A test runner (Jest / Vitest) must be configured before these run.
 *   - TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_ROLE_KEY env vars must be set.
 *   - Test seed data must include a course_blueprint, two course_sections,
 *     one course with blueprint_id set, and one course without.
 *
 * Run: npx vitest tests/e2e/enrollment-bridge.test.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const TEST_URL     = process.env.TEST_SUPABASE_URL              ?? ''
const SERVICE_KEY  = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? ''

// ── Test fixture IDs (must match seed data) ───────────────────────────────────
const SECTION_WITH_BP_ID   = '00000000-0000-0000-0022-000000000001'
const SECTION_NO_BP_ID     = '00000000-0000-0000-0022-000000000003'
const COURSE_WITH_BP_ID    = '00000000-0000-0000-0011-000000000001'
const COURSE_WITHOUT_BP_ID = '00000000-0000-0000-0011-000000000003'
const TEST_STUDENT_UID     = '00000000-0000-0000-0002-000000000003'
const TEST_ORG_ID          = '00000000-0000-0000-0010-000000000001'

let testStudentAuthId = ''

function serviceClient(): SupabaseClient {
  return createClient(TEST_URL, SERVICE_KEY)
}

async function cleanupStudent(studentUid: string) {
  const db = serviceClient()
  await db.from('direct_enrollments').delete().eq('user_id', testStudentAuthId)
  await db.from('enrollments').delete().eq('user_id', studentUid)
}

beforeAll(async () => {
  const db = serviceClient()
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  expect(error).toBeNull()
  testStudentAuthId = data.users.find(
    (user) => user.email === 'student@test.churchcore.dev',
  )?.id ?? ''
  expect(testStudentAuthId).toBeTruthy()
})

// ── Bridge trigger: active enrollment ─────────────────────────────────────────

describe('Bridge trigger on direct_enrollments INSERT', () => {
  beforeEach(() => cleanupStudent(TEST_STUDENT_UID))
  afterAll(()  => cleanupStudent(TEST_STUDENT_UID))

  it('creates an enrollment row when direct_enrollment is inserted as active', async () => {
    const db = serviceClient()
    const { error: insertErr } = await db.from('direct_enrollments').insert({
      user_id:            testStudentAuthId,
      section_id:         SECTION_WITH_BP_ID,
      status:  'active',
      org_id: TEST_ORG_ID,
    })
    expect(insertErr).toBeNull()

    // Trigger fires synchronously — row must appear immediately
    const { data: enrollment } = await db
      .from('enrollments')
      .select('id, transit_status')
      .eq('user_id',   TEST_STUDENT_UID)
      .eq('course_id', COURSE_WITH_BP_ID)
      .maybeSingle()

    expect(enrollment).not.toBeNull()
    expect(enrollment?.transit_status).toBe('not_started')
  })

  it('does NOT create an enrollment when the course has no blueprint_id', async () => {
    const db = serviceClient()

    // Insert a section linked to the no-blueprint course (seed must have such a section)
    const { error: insertErr } = await db.from('direct_enrollments').insert({
      user_id:            testStudentAuthId,
      section_id:         SECTION_NO_BP_ID,
      status:  'active',
      org_id: TEST_ORG_ID,
    })
    expect(insertErr).toBeNull()

    const { data: enrollment } = await db
      .from('enrollments')
      .select('id')
      .eq('user_id',   TEST_STUDENT_UID)
      .eq('course_id', COURSE_WITHOUT_BP_ID)
      .maybeSingle()

    expect(enrollment).toBeNull()
  })
})

// ── Sync trigger: withdrawal ───────────────────────────────────────────────────

describe('Sync trigger on direct_enrollments UPDATE (withdrawal)', () => {
  beforeEach(async () => {
    await cleanupStudent(TEST_STUDENT_UID)
    // Pre-create both rows so the update has something to propagate
    const db = serviceClient()
    await db.from('direct_enrollments').insert({
      user_id:            testStudentAuthId,
      section_id:         SECTION_WITH_BP_ID,
      status:  'active',
      org_id: TEST_ORG_ID,
    })
  })
  afterAll(() => cleanupStudent(TEST_STUDENT_UID))

  it('sets transit_status to dropped when direct_enrollment is withdrawn', async () => {
    const db = serviceClient()
    const { error: updateErr } = await db
      .from('direct_enrollments')
      .update({ status: 'withdrawn' })
      .eq('user_id', testStudentAuthId)
      .eq('section_id',  SECTION_WITH_BP_ID)

    expect(updateErr).toBeNull()

    const { data: enrollment } = await db
      .from('enrollments')
      .select('transit_status')
      .eq('user_id',   TEST_STUDENT_UID)
      .eq('course_id', COURSE_WITH_BP_ID)
      .maybeSingle()

    expect(enrollment?.transit_status).toBe('dropped')
  })
})

// ── Backfill idempotency ───────────────────────────────────────────────────────

describe('Bridge idempotency', () => {
  beforeEach(() => cleanupStudent(TEST_STUDENT_UID))
  afterAll(() => cleanupStudent(TEST_STUDENT_UID))

  it('does not create duplicate enrollments when the source row is replayed', async () => {
    const db = serviceClient()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await db.from('direct_enrollments').upsert({
        user_id: testStudentAuthId,
        section_id: SECTION_WITH_BP_ID,
        status: 'active',
        org_id: TEST_ORG_ID,
      }, { onConflict: 'user_id,section_id' })
      expect(error).toBeNull()
    }

    const { count, error } = await db
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', TEST_STUDENT_UID)
      .eq('course_id', COURSE_WITH_BP_ID)

    expect(error).toBeNull()
    expect(count).toBe(1)
  })
})
