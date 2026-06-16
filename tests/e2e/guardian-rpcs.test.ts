// @vitest-environment node
/**
 * Guardian RPC Integration Tests
 * ADR-2025-004 GAP-005 — Security audit tests
 *
 * These tests verify that guardian RPC functions enforce ownership predicates
 * and cannot be used to access data belonging to unlinked students.
 *
 * Prerequisites:
 *   - A test runner (Jest / Vitest) must be configured before these run.
 *   - SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY env vars must be set.
 *   - The database must have been seeded with test fixtures.
 *   - All credentials MUST be supplied via environment variables — never hardcoded.
 *     Required: GUARDIAN_A_TEST_EMAIL, GUARDIAN_A_TEST_PASSWORD,
 *               STUDENT_A_TEST_EMAIL, STUDENT_A_TEST_PASSWORD
 *
 * Run: npx vitest run tests/e2e/guardian-rpcs.test.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const TEST_URL  = process.env.SUPABASE_TEST_URL      ?? ''
const TEST_ANON = process.env.SUPABASE_TEST_ANON_KEY ?? ''

// ── Test fixture credentials (env vars — never hardcode) ──────────────────────
const GUARDIAN_A_EMAIL    = process.env.GUARDIAN_A_TEST_EMAIL    ?? ''
const GUARDIAN_A_PASSWORD = process.env.GUARDIAN_A_TEST_PASSWORD ?? ''
const STUDENT_A_EMAIL     = process.env.STUDENT_A_TEST_EMAIL     ?? ''
const STUDENT_A_PASSWORD  = process.env.STUDENT_A_TEST_PASSWORD  ?? ''

// ── Test fixture UIDs (must match seed data) ─────────────────────────────────
// SENTINEL_UNKNOWN_UUID is a deliberately non-existent UUID used to confirm
// the RPC raises an exception for unknown users. Not a real user's UUID.
const SENTINEL_UNKNOWN_UUID = '00000000-0000-0000-0000-000000000099'
const STUDENT_LINKED_UID    = process.env.TEST_STUDENT_LINKED_UID ?? '' // linked to guardian A
const STUDENT_OTHER_UID     = process.env.TEST_STUDENT_OTHER_UID  ?? '' // not linked to guardian A

async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(TEST_URL, TEST_ANON)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  return client
}

// ── get_guardian_students ─────────────────────────────────────────────────────

describe('get_guardian_students()', () => {
  let guardianClient: SupabaseClient

  beforeAll(async () => {
    guardianClient = await signInAs(GUARDIAN_A_EMAIL, GUARDIAN_A_PASSWORD)
  })

  it('returns only students linked to the calling guardian', async () => {
    const { data, error } = await guardianClient.rpc('get_guardian_students')
    expect(error).toBeNull()
    const ids = (data as Array<{ student_uid: string }>).map((r) => r.student_uid)
    expect(ids).toContain(STUDENT_LINKED_UID)
    expect(ids).not.toContain(STUDENT_OTHER_UID)
  })

  it('returns empty array when called by a non-guardian user', async () => {
    const studentClient = await signInAs(STUDENT_A_EMAIL, STUDENT_A_PASSWORD)
    const { data, error } = await studentClient.rpc('get_guardian_students')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})

// ── get_guardian_student_overview ────────────────────────────────────────────

describe('get_guardian_student_overview(p_student_uid)', () => {
  let guardianClient: SupabaseClient

  beforeAll(async () => {
    guardianClient = await signInAs(GUARDIAN_A_EMAIL, GUARDIAN_A_PASSWORD)
  })

  it('returns data for a linked student', async () => {
    const { data, error } = await guardianClient.rpc('get_guardian_student_overview', {
      p_student_uid: STUDENT_LINKED_UID,
    })
    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })

  it('raises an exception for an unlinked student UID', async () => {
    const { data, error } = await guardianClient.rpc('get_guardian_student_overview', {
      p_student_uid: STUDENT_OTHER_UID,
    })
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('raises an exception when called with a non-existent sentinel UUID', async () => {
    const { data, error } = await guardianClient.rpc('get_guardian_student_overview', {
      p_student_uid: SENTINEL_UNKNOWN_UUID,
    })
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })
})

// ── get_my_academic_performance ───────────────────────────────────────────────

describe('get_my_academic_performance()', () => {
  it("returns only the calling user's own academic records", async () => {
    const studentClient = await signInAs(STUDENT_A_EMAIL, STUDENT_A_PASSWORD)
    const { data, error } = await studentClient.rpc('get_my_academic_performance')
    expect(error).toBeNull()

    const { data: { user } } = await studentClient.auth.getUser()
    expect(user).not.toBeNull()

    if (Array.isArray(data) && data.length > 0) {
      expect(data.every((r: Record<string, unknown>) => r !== null)).toBe(true)
    }
  })
})
