// @vitest-environment node
/**
 * COUNCIL-2025-008: Critical-path E2E — sign-in → XP → certificate
 *
 * Exercises the full student lifecycle against the real test Supabase instance.
 * No mocks. Steps are ordered; each reads state written by the previous step.
 *
 * Required env vars (set by e2e.yml via GitHub secrets):
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY,
 *   TEST_SUPABASE_SERVICE_ROLE_KEY, TEST_USER_PASSWORD
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.TEST_SUPABASE_URL              ?? ''
const ANON_KEY     = process.env.TEST_SUPABASE_ANON_KEY         ?? ''
const SERVICE_KEY  = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? ''
const PASSWORD     = process.env.TEST_USER_PASSWORD             ?? ''

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !PASSWORD) {
  const missing = [
    !SUPABASE_URL && 'TEST_SUPABASE_URL',
    !ANON_KEY     && 'TEST_SUPABASE_ANON_KEY',
    !SERVICE_KEY  && 'TEST_SUPABASE_SERVICE_ROLE_KEY',
    !PASSWORD     && 'TEST_USER_PASSWORD',
  ].filter(Boolean).join(', ')
  throw new Error(`E2E critical-path: missing required env vars — ${missing}`)
}

// ── Seed constants (deterministic UUIDs from supabase/seed.test.sql) ─────────
const STUDENT_UID = '00000000-0000-0000-0002-000000000003'
const COURSE_ID   = '00000000-0000-0000-0003-000000000001'

// ── Module-level state threaded through ordered steps ─────────────────────────
let svc:     SupabaseClient  // service role — setup, reads, cleanup
let student: SupabaseClient  // student JWT — exercises RLS + SECURITY DEFINER RPCs
let baselineXP = 0           // recorded in STEP 3; restored in afterAll

// Mirrors public.calculate_level(p_xp) SQL function (migration 028)
function calculateLevel(xp: number): number {
  if (xp < 100)   return 1
  if (xp < 250)   return 2
  if (xp < 500)   return 3
  if (xp < 1000)  return 4
  if (xp < 2000)  return 5
  if (xp < 4000)  return 6
  if (xp < 8000)  return 7
  if (xp < 15000) return 8
  if (xp < 30000) return 9
  return 10
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  svc = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Sign in as the seed student — subsequent RPC calls use this JWT so that
  // SECURITY DEFINER functions see current_user_uid() = STUDENT_UID.
  const studentAnon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await studentAnon.auth.signInWithPassword({
    email:    'student@test.churchcore.dev',
    password: PASSWORD,
  })
  if (error) throw new Error(`Student sign-in failed: ${error.message}`)
  student = studentAnon
})

// ── Cleanup — reverts all state so the test is re-runnable ────────────────────

afterAll(async () => {
  try {
    await svc.from('course_certificates')
      .delete()
      .eq('user_id', STUDENT_UID)
      .eq('course_id', COURSE_ID)
  } catch (e) {
    console.warn('afterAll: certificate delete failed —', e)
  }

  try {
    await svc.from('profiles')
      .update({ xp_points: baselineXP, current_level: calculateLevel(baselineXP) })
      .eq('uid', STUDENT_UID)
  } catch (e) {
    console.warn('afterAll: XP reset failed —', e)
  }

  try {
    await svc.from('enrollments')
      .update({ transit_status: 'in_progress', progress_percent: 25, completed_at: null })
      .eq('user_id', STUDENT_UID)
      .eq('course_id', COURSE_ID)
  } catch (e) {
    console.warn('afterAll: enrollment reset failed —', e)
  }

  try {
    await student.auth.signOut()
  } catch (e) {
    console.warn('afterAll: sign-out failed —', e)
  }
})

// ── Critical path ─────────────────────────────────────────────────────────────

describe('Critical path: sign-in → XP → certificate', () => {
  it('STEP 1 — schema drift: columns from migrations 028–049 must exist', async () => {
    // profiles.xp_points + profiles.current_level — migration 028
    const { error: profileErr } = await svc
      .from('profiles').select('xp_points, current_level').limit(0)
    expect(
      profileErr,
      'profiles.xp_points or profiles.current_level missing — migration 028 not applied',
    ).toBeNull()

    // embeddings.embedding_status — migration 038
    const { error: embErr } = await svc
      .from('embeddings').select('embedding_status').limit(0)
    expect(
      embErr,
      'embeddings.embedding_status missing — migration 038 not applied',
    ).toBeNull()

    // admin_audit_log.actor_id — migration 049
    const { error: auditErr } = await svc
      .from('admin_audit_log').select('actor_id').limit(0)
    expect(
      auditErr,
      'admin_audit_log.actor_id missing — migration 049 not applied',
    ).toBeNull()
  })

  it('STEP 2 — course and enrollment exist in seed data', async () => {
    const { data: course, error: courseErr } = await svc
      .from('courses')
      .select('id, title, status')
      .eq('id', COURSE_ID)
      .single()
    expect(courseErr).toBeNull()
    expect(course?.status).toBe('published')

    const { data: enr, error: enrErr } = await svc
      .from('enrollments')
      .select('transit_status, progress_percent, user_id, course_id')
      .eq('user_id', STUDENT_UID)
      .eq('course_id', COURSE_ID)
      .single()
    expect(enrErr).toBeNull()
    expect(enr).not.toBeNull()
  })

  it('STEP 3 — record baseline XP', async () => {
    const { data, error } = await svc
      .from('profiles')
      .select('xp_points, current_level')
      .eq('uid', STUDENT_UID)
      .single()
    expect(error).toBeNull()
    baselineXP = data?.xp_points ?? 0
    expect(typeof baselineXP).toBe('number')
  })

  it('STEP 4 — award 10 XP via RPC (student JWT, current_user_uid() = STUDENT_UID)', async () => {
    const { data, error } = await student.rpc('award_xp', {
      p_uid:    STUDENT_UID,
      p_amount: 10,
    })
    expect(error).toBeNull()
    const result = data as {
      new_xp: number
      new_level: number
      leveled_up: boolean
      prev_level: number
    }
    expect(result.new_xp).toBe(baselineXP + 10)
    expect(result.new_level).toBeGreaterThanOrEqual(1)
  })

  it('STEP 5 — XP delta persisted: profiles.xp_points === baselineXP + 10', async () => {
    const { data, error } = await svc
      .from('profiles')
      .select('xp_points, current_level')
      .eq('uid', STUDENT_UID)
      .single()
    expect(error).toBeNull()
    expect(data?.xp_points).toBe(baselineXP + 10)
    expect(data?.current_level).toBeGreaterThanOrEqual(1)
  })

  it('STEP 6 — mark enrollment completed (prerequisite for issue_certificate)', async () => {
    const { error } = await svc
      .from('enrollments')
      .update({
        transit_status:   'completed',
        progress_percent: 100,
        completed_at:     new Date().toISOString(),
      })
      .eq('user_id', STUDENT_UID)
      .eq('course_id', COURSE_ID)
    expect(error).toBeNull()
  })

  it('STEP 7 — issue certificate via RPC (student JWT)', async () => {
    const { data, error } = await student.rpc('issue_certificate', {
      p_uid:       STUDENT_UID,
      p_course_id: COURSE_ID,
    })
    expect(error).toBeNull()
    const result = data as {
      certificate_id:  string
      certificate_no:  string
      final_grade:     number | null
      letter_grade:    string
      error?:          string
    }
    // issue_certificate returns { error: '...' } in the JSON body on failure
    expect(result.error).toBeUndefined()
    expect(result.certificate_no).toBeTruthy()
    expect(result.letter_grade).not.toBeNull()
  })

  it('STEP 8 — course_certificates row persisted with non-null certificate_no', async () => {
    const { data, error } = await svc
      .from('course_certificates')
      .select('id, user_id, course_id, certificate_no, letter_grade')
      .eq('user_id',   STUDENT_UID)
      .eq('course_id', COURSE_ID)
      .single()
    expect(error).toBeNull()
    expect(data?.certificate_no).toBeTruthy()
    expect(data?.letter_grade).not.toBeNull()
    expect(data?.user_id).toBe(STUDENT_UID)
    expect(data?.course_id).toBe(COURSE_ID)
  })
})
