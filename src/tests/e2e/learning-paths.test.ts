// @vitest-environment node
/**
 * Learning Paths — e2e tenant-isolation + RLS tests
 * COUNCIL-2026-029 Prompt D, items 6-8
 *
 * The council doc's QA Lead vote was "APPROVE, conditional on coverage" — a
 * binding condition requiring at least one e2e test proving tenant isolation
 * before merge. This file covers that condition directly against a real
 * Supabase instance, with no application-layer mocking.
 *
 * Server actions (createLearningPath, getLearningPathsForLearner, etc.) use
 * next/headers cookies() and cannot be called directly from a plain vitest
 * process (same limitation documented in gradebook-grid.test.ts) — these tests
 * exercise the RLS policies and underlying data directly, which is the actual
 * security boundary getLearningPathsForLearner relies on (its own code comment
 * says so). The completedCount arithmetic itself (resolving the domain uid via
 * profile_roles before querying course_certificates) is covered by a unit test
 * in src/tests/unit/learning-paths.test.ts, since it requires mocking the
 * server-action call chain rather than a real request context.
 *
 * Covers:
 *   6. Org A's published path is not visible to Org B's learner (tenant isolation).
 *   7. A draft path in Org A is not visible to an Org A learner (same-org, unpublished).
 *      Also covers the learning_path_courses junction-table policy gap found while
 *      writing this test: the "member read" policy originally checked only org
 *      membership, not is_published, so a member who knew a draft path's id could
 *      still read its course list. Fixed in the migration; this test proves it.
 *   8. A published path's course-completion data (course_certificates) is correctly
 *      scoped and readable so completedCount can be computed — see the unit test
 *      above for the actual arithmetic proof.
 *
 * Required env vars (same as gradebook-grid.test.ts):
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY,
 *   TEST_USER_PASSWORD
 *
 * Seed users (supabase/seed.test.sql):
 *   student@test.churchcore.dev    — student role, Org A (uid = STUDENT_A_UID)
 *   student-b@test.churchcore.dev  — student role, Org B (uid = STUDENT_B_UID)
 *   admin@test.churchcore.dev      — admin role, Org A   (uid = ADMIN_A_UID)
 *
 * Fixture UUIDs (namespace 0072 — no collision with seed 0010/0011/0020/0021 or
 * the gradebook grid e2e suite's 0070 namespace):
 *   FIXTURE_PATH_PUBLISHED = 00000000-0000-0000-0072-000000000001 (Org A, published)
 *   FIXTURE_PATH_DRAFT     = 00000000-0000-0000-0072-000000000002 (Org A, draft)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// ── Env-var bootstrap ─────────────────────────────────────────────────────────

const URL         = process.env.TEST_SUPABASE_URL              ?? ''
const ANON        = process.env.TEST_SUPABASE_ANON_KEY         ?? ''
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? ''
const PASSWORD    = process.env.TEST_USER_PASSWORD             ?? ''

if (!URL || !ANON || !SERVICE_KEY || !PASSWORD) {
  const missing = [
    !URL         && 'TEST_SUPABASE_URL',
    !ANON        && 'TEST_SUPABASE_ANON_KEY',
    !SERVICE_KEY && 'TEST_SUPABASE_SERVICE_ROLE_KEY',
    !PASSWORD    && 'TEST_USER_PASSWORD',
  ].filter(Boolean).join(', ')
  throw new Error(`Learning-paths e2e: missing required env vars — ${missing}`)
}

// ── Deterministic UUIDs (must match supabase/seed.test.sql) ───────────────────

const ORG_A         = '00000000-0000-0000-0010-000000000001'
const ORG_B         = '00000000-0000-0000-0010-000000000002'
const STUDENT_A_UID = '00000000-0000-0000-0002-000000000003'
const COURSE_A      = '00000000-0000-0000-0011-000000000001'

// Fixture constants (namespace 0072)
const FIXTURE_PATH_PUBLISHED = '00000000-0000-0000-0072-000000000001'
const FIXTURE_PATH_DRAFT     = '00000000-0000-0000-0072-000000000002'

// ── Module-level state ────────────────────────────────────────────────────────

let svc:      SupabaseClient  // service role — setup, reads, cleanup
let studentA: SupabaseClient  // student@test.churchcore.dev (Org A)
let studentB: SupabaseClient  // student-b@test.churchcore.dev (Org B)
let adminA:   SupabaseClient  // admin@test.churchcore.dev (Org A)

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  return client
}

async function wipeFixtureRows() {
  await svc.from('course_certificates').delete().eq('user_id', STUDENT_A_UID).eq('course_id', COURSE_A)
  await svc.from('learning_path_courses').delete().in('path_id', [FIXTURE_PATH_PUBLISHED, FIXTURE_PATH_DRAFT])
  await svc.from('learning_paths').delete().in('id', [FIXTURE_PATH_PUBLISHED, FIXTURE_PATH_DRAFT])
}

beforeAll(async () => {
  svc = createClient(URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  studentA = await signIn('student@test.churchcore.dev')
  studentB = await signIn('student-b@test.churchcore.dev')
  adminA   = await signIn('admin@test.churchcore.dev')

  // Clean up any leftover fixture data from a previous crashed run
  await wipeFixtureRows()

  const { error: pathErr } = await svc.from('learning_paths').insert([
    {
      id:           FIXTURE_PATH_PUBLISHED,
      org_id:       ORG_A,
      title:        'E2E Published Path',
      is_published: true,
    },
    {
      id:           FIXTURE_PATH_DRAFT,
      org_id:       ORG_A,
      title:        'E2E Draft Path',
      is_published: false,
    },
  ])
  if (pathErr) throw new Error(`Failed to insert fixture learning_paths: ${pathErr.message}`)

  const { error: lpcErr } = await svc.from('learning_path_courses').insert([
    { path_id: FIXTURE_PATH_PUBLISHED, course_id: COURSE_A, sort_order: 0 },
    { path_id: FIXTURE_PATH_DRAFT,     course_id: COURSE_A, sort_order: 0 },
  ])
  if (lpcErr) throw new Error(`Failed to insert fixture learning_path_courses: ${lpcErr.message}`)
})

afterAll(async () => {
  await wipeFixtureRows()
})

// ─────────────────────────────────────────────────────────────────────────────
// CRITERION 6: Org A's published path is not visible to Org B's learner
// ─────────────────────────────────────────────────────────────────────────────

describe('Criterion 6 — cross-org tenant isolation', () => {
  it('student-a (Org A) can see the published Org A path', async () => {
    const { data, error } = await studentA
      .from('learning_paths')
      .select('id')
      .eq('id', FIXTURE_PATH_PUBLISHED)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('student-b (Org B) cannot see the published Org A path', async () => {
    const { data, error } = await studentB
      .from('learning_paths')
      .select('id')
      .eq('id', FIXTURE_PATH_PUBLISHED)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('student-b (Org B) cannot read learning_path_courses for the Org A published path', async () => {
    const { data, error } = await studentB
      .from('learning_path_courses')
      .select('id')
      .eq('path_id', FIXTURE_PATH_PUBLISHED)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CRITERION 7: A draft path in the same org is not visible to a learner
// ─────────────────────────────────────────────────────────────────────────────

describe('Criterion 7 — draft path hidden from same-org learner', () => {
  it('student-a (Org A) cannot see the Org A draft path', async () => {
    const { data, error } = await studentA
      .from('learning_paths')
      .select('id')
      .eq('id', FIXTURE_PATH_DRAFT)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('student-a (Org A) cannot read learning_path_courses for the Org A draft path either — the junction-table gap found and fixed in this migration', async () => {
    // Before the fix, "learning_path_courses: member read" checked only org
    // membership, not is_published, so this would have returned 1 row despite
    // the parent learning_paths row being correctly hidden above.
    const { data, error } = await studentA
      .from('learning_path_courses')
      .select('id')
      .eq('path_id', FIXTURE_PATH_DRAFT)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('admin-a (Org A) CAN see the draft path — admin/manager read all paths in their org', async () => {
    const { data, error } = await adminA
      .from('learning_paths')
      .select('id, is_published')
      .eq('id', FIXTURE_PATH_DRAFT)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].is_published).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CRITERION 8: Course-completion data is correctly scoped for progress tracking
// ─────────────────────────────────────────────────────────────────────────────

describe('Criterion 8 — course-completion data for progress tracking', () => {
  afterAll(async () => {
    await svc.from('course_certificates').delete().eq('user_id', STUDENT_A_UID).eq('course_id', COURSE_A)
  })

  it('student-a can read their own certificate for a course in the published path', async () => {
    const { error: certErr } = await svc.from('course_certificates').insert({
      user_id:   STUDENT_A_UID,
      course_id: COURSE_A,
    })
    if (certErr) throw new Error(`Failed to insert fixture certificate: ${certErr.message}`)

    // This is the exact query getLearningPathsForLearner() runs (after resolving
    // the domain uid via profile_roles — see the unit-test regression proof).
    const { data, error } = await studentA
      .from('course_certificates')
      .select('course_id')
      .eq('user_id', STUDENT_A_UID)

    expect(error).toBeNull()
    expect(data?.some((c) => c.course_id === COURSE_A)).toBe(true)
  })

  it('student-b (Org B) cannot read student-a\'s certificate', async () => {
    const { data, error } = await studentB
      .from('course_certificates')
      .select('course_id')
      .eq('user_id', STUDENT_A_UID)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})
