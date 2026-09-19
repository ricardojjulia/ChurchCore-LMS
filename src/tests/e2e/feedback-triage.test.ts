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
const APP_BASE_URL = process.env.APP_BASE_URL              ?? 'http://localhost:3000'
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
// Row A has no fixed id — it's created dynamically by the route itself (criterion 9).
const TEST_ROW_B = '00000000-feed-bac0-0000-000000000002'  // reopen test fingerprint seed
const SESSION_ID_A = '00000000-feed-5e55-0000-00000000000a'  // sessionId used by the real POST calls for row A

// Compute deterministic fingerprints the same way the route does
const FINGERPRINT_A = computeFingerprint('/test/e2e-a', 'BUG', 'e2e test button failure')
const FINGERPRINT_B = computeFingerprint('/test/e2e-b', 'ERROR', 'e2e test crash scenario')

// ── Client declarations ────────────────────────────────────────────────────────
let svc:      SupabaseClient   // service role — setup, teardown, criterion 12 verify
let adminClient: SupabaseClient // platform admin JWT — criterion 12
let nonAdminClient: SupabaseClient // regular user JWT — criterion 11
let anonClient: SupabaseClient  // no session — criterion 11
let adminAuthId: string          // tracked so afterAll cleanup can be scoped correctly
let createdPlatformAdminRow = false // only true if THIS run inserted the platform_admins row

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

  const signedInAdminAuthId = adminSignIn.user?.id
  if (!signedInAdminAuthId) throw new Error('Platform admin sign-in returned no user id')
  adminAuthId = signedInAdminAuthId

  // Check whether this user is ALREADY a platform admin before touching the table —
  // afterAll must only remove what this run actually created, not a legitimate
  // pre-existing entry for the configured fixture user (see afterAll below).
  const { data: preExisting, error: preExistingErr } = await svc
    .from('platform_admins')
    .select('auth_id')
    .eq('auth_id', adminAuthId)
    .maybeSingle()
  if (preExistingErr) throw new Error(`Failed to check existing platform_admins row: ${preExistingErr.message}`)

  if (!preExisting) {
    const { error: insertErr } = await svc
      .from('platform_admins')
      .insert({ auth_id: adminAuthId, display_name: 'E2E Test Platform Admin' })
    if (insertErr) throw new Error(`Failed to insert platform admin: ${insertErr.message}`)
    createdPlatformAdminRow = true
  }

  // ── Seed test feedback rows ────────────────────────────────────────────────
  // Clean up any leftover rows from a previous run first
  await svc.from('platform_feedback').delete().in('fingerprint', [FINGERPRINT_A, FINGERPRINT_B])

  // Only row B is pre-seeded directly: criterion 10 needs a row that already
  // exists and has been marked "processed" before the reopen-via-route
  // assertion runs. Row A is intentionally NOT pre-seeded — the criterion 9
  // test creates it itself via two real POST /api/feedback calls.
  const { error: seedErr } = await svc.from('platform_feedback').insert([
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

  // Remove the platform_admins row ONLY if this run created it — if the
  // configured fixture user was already a legitimate platform admin before
  // this test ran, that access must not be revoked as a side effect.
  if (createdPlatformAdminRow) {
    try {
      await svc.from('platform_admins').delete().eq('auth_id', adminAuthId)
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
  it('two real POST /api/feedback submissions with equivalent route/category/note collapse to one row with hit_count = 2', async () => {
    const payload = {
      sessionId:   SESSION_ID_A,
      route:       '/test/e2e-a',
      category:    'BUG',
      note:        'e2e test button failure',
      breadcrumbs: [],
    }

    // First submission — creates the row via the real route (not a direct insert).
    const firstRes = await fetch(`${APP_BASE_URL}/api/feedback`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    expect(firstRes.status).toBe(201)

    const { data: afterFirst, error: firstFetchErr } = await svc
      .from('platform_feedback')
      .select('id, hit_count')
      .eq('fingerprint', FINGERPRINT_A)
      .single()

    expect(firstFetchErr).toBeNull()
    expect(afterFirst).not.toBeNull()
    expect(afterFirst!.hit_count).toBe(1)

    // Second, equivalent submission — must go through the same route and hit
    // the update/reopen branch, not a fresh insert. A broken dedupe path in
    // the route itself (not just the DB's unique constraint) would surface here.
    const secondRes = await fetch(`${APP_BASE_URL}/api/feedback`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    expect(secondRes.status).toBe(201)

    // Verify exactly one row and hit_count = 2
    const { data: after, error: afterErr } = await svc
      .from('platform_feedback')
      .select('id, hit_count')
      .eq('fingerprint', FINGERPRINT_A)
      .single()

    expect(afterErr).toBeNull()
    expect(after!.hit_count).toBe(2)
    // Same row, not a duplicate insert
    expect(after!.id).toBe(afterFirst!.id)
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
  it('marks a row processed, then a real resubmission through the route reopens it', async () => {
    // Mark the row as processed with a triage action — simulates a staff
    // triage action taken via the platform UI (legitimately a direct write,
    // not something the submission route itself does).
    const { data: beforeReopen, error: markErr } = await svc
      .from('platform_feedback')
      .update({ processed: true, triage_action: 'fixed' })
      .eq('fingerprint', FINGERPRINT_B)
      .select('hit_count')
      .single()

    expect(markErr).toBeNull()

    // Verify it is now processed
    const { data: marked } = await svc
      .from('platform_feedback')
      .select('processed, triage_action')
      .eq('fingerprint', FINGERPRINT_B)
      .single()

    expect(marked?.processed).toBe(true)
    expect(marked?.triage_action).toBe('fixed')

    // Resubmit through the real route — this is what must actually reopen the
    // row. A broken update/reopen branch in the route would leave it processed.
    const res = await fetch(`${APP_BASE_URL}/api/feedback`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId:    '00000000-feed-5e55-0000-000000000002',
        route:        '/test/e2e-b',
        category:     'ERROR',
        errorMessage: 'e2e test crash scenario',
        breadcrumbs:  [],
      }),
    })
    expect(res.status).toBe(201)

    // Verify the row is now reopened
    const { data: after } = await svc
      .from('platform_feedback')
      .select('processed, triage_action, hit_count')
      .eq('fingerprint', FINGERPRINT_B)
      .single()

    expect(after?.processed).toBe(false)
    expect(after?.triage_action).toBeNull()
    expect(after!.hit_count).toBeGreaterThan(beforeReopen!.hit_count)
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
