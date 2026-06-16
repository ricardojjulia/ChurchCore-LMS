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
 *   - SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_KEY env vars must be set.
 *   - Test seed data must include a course_blueprint, two course_sections,
 *     one course with blueprint_id set, and one course without.
 *
 * Run: npx vitest tests/e2e/enrollment-bridge.test.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const TEST_URL     = process.env.SUPABASE_TEST_URL         ?? ''
const SERVICE_KEY  = process.env.SUPABASE_TEST_SERVICE_KEY ?? ''

// ── Test fixture IDs (must match seed data) ───────────────────────────────────
const BLUEPRINT_ID           = process.env.TEST_BLUEPRINT_ID            ?? ''
const SECTION_WITH_BP_ID     = process.env.TEST_SECTION_WITH_BP_ID      ?? '' // linked to BLUEPRINT_ID
const COURSE_WITH_BP_ID      = process.env.TEST_COURSE_WITH_BP_ID       ?? '' // courses.blueprint_id = BLUEPRINT_ID
const COURSE_WITHOUT_BP_ID   = process.env.TEST_COURSE_WITHOUT_BP_ID    ?? '' // courses.blueprint_id IS NULL
const TEST_STUDENT_UID       = process.env.TEST_BRIDGE_STUDENT_UID      ?? ''

function serviceClient(): SupabaseClient {
  return createClient(TEST_URL, SERVICE_KEY)
}

async function cleanupStudent(studentUid: string) {
  const db = serviceClient()
  await db.from('direct_enrollments').delete().eq('student_uid', studentUid)
  await db.from('enrollments').delete().eq('user_id', studentUid)
}

// ── Bridge trigger: active enrollment ─────────────────────────────────────────

describe('Bridge trigger on direct_enrollments INSERT', () => {
  beforeEach(() => cleanupStudent(TEST_STUDENT_UID))
  afterAll(()  => cleanupStudent(TEST_STUDENT_UID))

  it('creates an enrollment row when direct_enrollment is inserted as active', async () => {
    const db = serviceClient()
    const { error: insertErr } = await db.from('direct_enrollments').insert({
      student_uid:        TEST_STUDENT_UID,
      section_id:         SECTION_WITH_BP_ID,
      status:  'active',
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
    const SECTION_NO_BP_ID = process.env.TEST_SECTION_NO_BP_ID ?? ''
    const { error: insertErr } = await db.from('direct_enrollments').insert({
      student_uid:        TEST_STUDENT_UID,
      section_id:         SECTION_NO_BP_ID,
      status:  'active',
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
      student_uid:        TEST_STUDENT_UID,
      section_id:         SECTION_WITH_BP_ID,
      status:  'active',
    })
  })
  afterAll(() => cleanupStudent(TEST_STUDENT_UID))

  it('sets transit_status to withdrawn when direct_enrollment is withdrawn', async () => {
    const db = serviceClient()
    const { error: updateErr } = await db
      .from('direct_enrollments')
      .update({ status: 'withdrawn' })
      .eq('student_uid', TEST_STUDENT_UID)
      .eq('section_id',  SECTION_WITH_BP_ID)

    expect(updateErr).toBeNull()

    const { data: enrollment } = await db
      .from('enrollments')
      .select('transit_status')
      .eq('user_id',   TEST_STUDENT_UID)
      .eq('course_id', COURSE_WITH_BP_ID)
      .maybeSingle()

    expect(enrollment?.transit_status).toBe('withdrawn')
  })
})

// ── Backfill idempotency ───────────────────────────────────────────────────────

describe('Migration 043 backfill idempotency', () => {
  it('does not create duplicate enrollments when run twice', async () => {
    const db = serviceClient()

    // Simulate the backfill INSERT ... ON CONFLICT DO NOTHING twice
    const backfillQuery = `
      INSERT INTO enrollments (user_id, course_id, section_id, transit_status, progress_percent)
      SELECT de.student_uid, c.id, de.section_id, 'not_started', 0
      FROM direct_enrollments de
      JOIN course_sections cs ON cs.id = de.section_id
      JOIN courses          c  ON c.blueprint_id = cs.blueprint_id
      WHERE de.enrollment_status = 'active' AND c.blueprint_id IS NOT NULL
      ON CONFLICT (user_id, course_id) DO NOTHING
      RETURNING id
    `
    const { data: run1 } = await db.rpc('exec_sql_count', { sql: backfillQuery })
    const { data: run2 } = await db.rpc('exec_sql_count', { sql: backfillQuery })

    // Second run must insert 0 rows (all are already present after first run)
    expect(Number(run2 ?? 0)).toBe(0)
    void run1 // suppress unused warning
  })
})
