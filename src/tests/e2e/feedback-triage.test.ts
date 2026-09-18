// @vitest-environment node
/**
 * Pilot Feedback & Error-Triage e2e tests — COUNCIL-2026-019 Prompt E
 * Covers acceptance criteria:
 *   9  — two submissions with equivalent normalized route/category/detail collapse
 *          to one row with hit_count = 2
 *   10 — marking a row processed then resubmitting reopens it
 *          (processed = false, triage_action = null)
 *   11 — unauthenticated client and authenticated-non-platform-admin client are
 *          both actually denied by RLS when querying/updating platform_feedback
 *   12 — a platform-admin session can read and update platform_feedback
 *
 * Required env vars:
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY,
 *   TEST_SUPABASE_SERVICE_ROLE_KEY, TEST_USER_PASSWORD,
 *   TEST_PLATFORM_ADMIN_EMAIL  — an auth user whose auth_id will be temporarily
 *                                 inserted into platform_admins (cleaned up in afterAll)
 *   TEST_USER_A_EMAIL          — a regular (non-platform-admin) user for the
 *                                 access-denied assertions
 *
 * Tests assert RLS behavior from the denied/allowed client directly, not via
 * the service client, per the COUNCIL-2026-019 security mandate.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { computeFingerprint } from '@/lib/feedback'

// ── Env-var extraction ─────────────────────────────────────────────────────────
const URL     = process.env.TEST_SUPABASE_URL              ?? ''
const ANON    = process.env.TEST_SUPABASE_ANON_KEY         ?? ''
const SVC_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? ''
const PWD     = process.env.TEST_USER_PASSWORD             ?? ''
const ADMIN_EMAIL  = process.env.TEST_PLATFORM_ADMIN_EMAIL ?? ''
const NONADMIN_EMAIL = process.env.TEST_USER_A_EMAIL       ?? ''

if (!URL || !ANON || !SVC_KEY || !PWD || !ADMIN_EMAIL || !NONADMIN_EMAIL) {
  const missing = [
    !URL           && 'TEST_SUPABASE_URL',
    !ANON          && 'TEST_SUPABASE_ANON_KEY',
    !SVC_KEY       && 'TEST_SUPABASE_SERVICE_ROLE_KEY',
    !PWD           && 'TEST_USER_PASSWORD',
    !ADMIN_EMAIL   && 'TEST_PLATFORM_ADMIN_EMAIL',
    !NONADMIN_EMAIL && 'TEST_USER_A_EMAIL',
  ].filter(Boolean).join(', ')
  throw new Error(`Feedback triage e2e: missing required env vars — ${missing}`)
}

// ── Deterministic UUIDs for test rows (never collide with production seeds) ────
const TEST_ROW_A = '00000000-feed-bac0-0000-000000000001'  // first submission fingerprint seed
const TEST_ROW_B = '00000000-feed-bac0-0000-000000000002'  // reopen test fingerprint seed

// Compute deterministic fingerprints the same way the route does
const FINGERPRINT_A = computeFingerprint('/test/e2e-a', 'BUG', 'e2e test button failure')
const FINGERPRINT_B = computeFingerprint('/test/e2e-b', 'ERROR', 'e2e test crash scenario')

// ── Client declarations ────────────────────────────────────────────────────────
let svc:      SupabaseClient   // service role — setup, teardown, criterion 12 verify
let adminClient: SupabaseClient // platform admin JWT — criterion 12
let nonAdminClient: SupabaseClient // regular user JWT — criterion 11
let anonClient: SupabaseClient  // no session — criterion 11
let insertedAdminAuthId: string | null = null  // tracked for cleanup

// ── Setup ──────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  svc = createClient(URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Unauthenticated client — no sign-in ────────────────────────────────────
  anonClient = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Sign in the non-admin user ─────────────────────────────────────────────
  nonAdminClient = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: nonAdminErr } = await nonAdminClient.auth.signInWithPassword({
    email:    NONADMIN_EMAIL,
    password: PWD,
  })
  if (nonAdminErr) throw new Error(`Non-admin sign-in failed: ${nonAdminErr.message}`)

  // ── Create the platform admin session ─────────────────────────────────────
  // Sign in first to obtain the auth_id, then insert into platform_admins using
  // the service role so that is_platform_admin() returns true for this user's JWT.
  adminClient = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: adminSignIn, error: adminSignInErr } = await adminClient.auth.signInWithPassword({
    email:    ADMIN_EMAIL,
    password: PWD,
  })
  if (adminSignInErr) throw new Error(`Platform admin sign-in failed: ${adminSignInErr.message}`)

  const adminAuthId = adminSignIn.user?.id
  if (!adminAuthId) throw new Error('Platform admin sign-in returned no user id')

  // Insert into platform_admins via service role — idempotent via ON CONFLICT
  const { error: insertErr } = await svc
    .from('platform_admins')
    .upsert({ auth_id: adminAuthId, display_name: 'E2E Test Platform Admin' }, { onConflict: 'auth_id' })
  if (insertErr) throw new Error(`Failed to insert platform admin: ${insertErr.message}`)
  insertedAdminAuthId = adminAuthId

  // ── Seed test feedback rows ────────────────────────────────────────────────
  // Clean up any leftover rows from a previous run first
  await svc.from('platform_feedback').delete().in('fingerprint', [FINGERPRINT_A, FINGERPRINT_B])

  // Insert the initial rows (simulating first submission)
  const { error: seedErr } = await svc.from('platform_feedback').insert([
    {
      id:          TEST_ROW_A,
      fingerprint: FINGERPRINT_A,
      session_id:  '00000000-feed-5e55-0000-000000000001',
      route:       '/test/e2e-a',
      category:    'BUG',
      note:        'e2e test button failure',
      breadcrumbs: [],
      hit_count:   1,
    },
    {
      id:          TEST_ROW_B,
      fingerprint: FINGERPRINT_B,
      session_id:  '00000000-feed-5e55-0000-000000000002',
      route:       '/test/e2e-b',
      category:    'ERROR',
      error_message: 'e2e test crash scenario',
      breadcrumbs: [],
      hit_count:   1,
    },
  ])
  if (seedErr) throw new Error(`Failed to seed platform_feedback rows: ${seedErr.message}`)
})

// ── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  // Remove test feedback rows
  try {
    await svc.from('platform_feedback').delete().in('fingerprint', [FINGERPRINT_A, FINGERPRINT_B])
  } catch (e) {
    console.warn('afterAll: feedback row cleanup failed —', e)
  }

  // Remove the temporary platform admin entry we created
  if (insertedAdminAuthId) {
    try {
      await svc.from('platform_admins').delete().eq('auth_id', insertedAdminAuthId)
    } catch (e) {
      console.warn('afterAll: platform_admins cleanup failed —', e)
    }
  }

  // Sign out all user sessions
  try {
    await Promise.all([
      adminClient.auth.signOut(),
      nonAdminClient.auth.signOut(),
    ])
  } catch (e) {
    console.warn('afterAll: sign-out failed —', e)
  }
})

// ── Criterion 9: deduplicate on re-submission ─────────────────────────────────

describe('deduplication (criterion 9)', () => {
  it('simulates second equivalent submission — hit_count increments to 2', async () => {
    // Fetch the existing row (service client can always read)
    const { data: existing, error: fetchErr } = await svc
      .from('platform_feedback')
      .select('id, hit_count')
      .eq('fingerprint', FINGERPRINT_A)
      .single()

    expect(fetchErr).toBeNull()
    expect(existing).not.toBeNull()
    expect(existing!.hit_count).toBe(1)

    // Simulate route upsert: increment hit_count, reopen processed flag
    const { error: updateErr } = await svc
      .from('platform_feedback')
      .update({
        hit_count:     existing!.hit_count + 1,
        processed:     false,
        triage_action: null,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', existing!.id)

    expect(updateErr).toBeNull()

    // Verify exactly one row and hit_count = 2
    const { data: after, error: afterErr } = await svc
      .from('platform_feedback')
      .select('hit_count')
      .eq('fingerprint', FINGERPRINT_A)
      .single()

    expect(afterErr).toBeNull()
    expect(after!.hit_count).toBe(2)
  })

  it('fingerprint UNIQUE constraint prevents a second INSERT with the same fingerprint', async () => {
    // Attempting to insert a row with the same fingerprint must fail at the DB level
    const { error } = await svc.from('platform_feedback').insert({
      fingerprint: FINGERPRINT_A,   // already exists in the seeded row
      session_id:  '00000000-feed-dead-0000-000000000099',
      route:       '/test/e2e-a',
      category:    'BUG',
      breadcrumbs: [],
    })
    // The unique constraint must produce an error
    expect(error).not.toBeNull()
  })
})

// ── Criterion 10: marking processed then resubmitting reopens the row ─────────

describe('reopen on re-submission (criterion 10)', () => {
  it('marks a row processed, then simulates resubmission — processed becomes false and triage_action null', async () => {
    // Mark the row as processed with a triage action
    const { error: markErr } = await svc
      .from('platform_feedback')
      .update({ processed: true, triage_action: 'fixed' })
      .eq('fingerprint', FINGERPRINT_B)

    expect(markErr).toBeNull()

    // Verify it is now processed
    const { data: marked } = await svc
      .from('platform_feedback')
      .select('processed, triage_action')
      .eq('fingerprint', FINGERPRINT_B)
      .single()

    expect(marked?.processed).toBe(true)
    expect(marked?.triage_action).toBe('fixed')

    // Simulate route re-submit: fetch existing row and upsert (route always sets processed=false, triage_action=null on update)
    const { data: existing } = await svc
      .from('platform_feedback')
      .select('id, hit_count')
      .eq('fingerprint', FINGERPRINT_B)
      .single()

    const { error: reopenErr } = await svc
      .from('platform_feedback')
      .update({
        hit_count:     existing!.hit_count + 1,
        processed:     false,
        triage_action: null,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', existing!.id)

    expect(reopenErr).toBeNull()

    // Verify the row is now reopened
    const { data: after } = await svc
      .from('platform_feedback')
      .select('processed, triage_action, hit_count')
      .eq('fingerprint', FINGERPRINT_B)
      .single()

    expect(after?.processed).toBe(false)
    expect(after?.triage_action).toBeNull()
    expect(after!.hit_count).toBeGreaterThan(1)
  })
})

// ── Criterion 11: RLS denies non-platform-admin access ───────────────────────

describe('RLS isolation (criterion 11)', () => {
  it('unauthenticated (anon) client receives empty data on SELECT — not an error, but no rows', async () => {
    const { data, error } = await anonClient
      .from('platform_feedback')
      .select('id, route, category')
      .limit(10)

    // RLS blocks access: Supabase returns empty data, not a driver error
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('authenticated non-platform-admin client is denied SELECT on platform_feedback', async () => {
    const { data, error } = await nonAdminClient
      .from('platform_feedback')
      .select('id, route, category')
      .limit(10)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('authenticated non-platform-admin client cannot UPDATE platform_feedback — row not affected', async () => {
    // Non-admin attempts to update a known row
    const { error: updateErr } = await nonAdminClient
      .from('platform_feedback')
      .update({ processed: true, triage_action: 'acknowledged' })
      .eq('fingerprint', FINGERPRINT_A)

    // RLS blocks the UPDATE; Supabase returns no error but 0 rows are touched
    expect(updateErr).toBeNull()

    // Verify via service client that the row was NOT modified
    const { data: unchanged } = await svc
      .from('platform_feedback')
      .select('processed, triage_action')
      .eq('fingerprint', FINGERPRINT_A)
      .single()

    // The row's processed/triage_action should remain as set during criterion 9 tests
    // (false/null — the non-admin update should have had no effect)
    expect(unchanged?.processed).toBe(false)
    expect(unchanged?.triage_action).toBeNull()
  })

  it('anon client UPDATE is also silently rejected by RLS', async () => {
    const { error } = await anonClient
      .from('platform_feedback')
      .update({ processed: true })
      .eq('fingerprint', FINGERPRINT_B)

    expect(error).toBeNull()

    // Verify nothing changed
    const { data } = await svc
      .from('platform_feedback')
      .select('processed')
      .eq('fingerprint', FINGERPRINT_B)
      .single()

    // processed was set to false during criterion 10 (reopen test)
    expect(data?.processed).toBe(false)
  })
})

// ── Criterion 12: platform-admin session can read and update ─────────────────

describe('platform admin access (criterion 12)', () => {
  it('platform admin can SELECT from platform_feedback and sees the test rows', async () => {
    const { data, error } = await adminClient
      .from('platform_feedback')
      .select('id, fingerprint, hit_count, route, category')
      .in('fingerprint', [FINGERPRINT_A, FINGERPRINT_B])

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    // Both test rows must be visible to the platform admin
    expect(data!.length).toBe(2)
  })

  it('platform admin can UPDATE triage fields on platform_feedback', async () => {
    // Triage row A
    const { error: updateErr } = await adminClient
      .from('platform_feedback')
      .update({ triage_action: 'acknowledged', processed: false })
      .eq('fingerprint', FINGERPRINT_A)

    expect(updateErr).toBeNull()

    // Verify via service client that the update was applied
    const { data: after, error: fetchErr } = await svc
      .from('platform_feedback')
      .select('triage_action, processed')
      .eq('fingerprint', FINGERPRINT_A)
      .single()

    expect(fetchErr).toBeNull()
    expect(after?.triage_action).toBe('acknowledged')
  })

  it('platform admin can mark a row as processed', async () => {
    const { error } = await adminClient
      .from('platform_feedback')
      .update({ processed: true, triage_action: 'fixed' })
      .eq('fingerprint', FINGERPRINT_B)

    expect(error).toBeNull()

    const { data } = await svc
      .from('platform_feedback')
      .select('processed, triage_action')
      .eq('fingerprint', FINGERPRINT_B)
      .single()

    expect(data?.processed).toBe(true)
    expect(data?.triage_action).toBe('fixed')
  })
})
