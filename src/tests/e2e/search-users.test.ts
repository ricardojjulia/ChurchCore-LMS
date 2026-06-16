// @vitest-environment node
/**
 * COUNCIL-2025-009 G2-B: search-users Edge Function smoke tests.
 *
 * Verifies the deployed Edge Function returns correct responses for:
 *   1. Authenticated admin — 200 with results
 *   2. No auth header      — 401
 *   3. Student role        — 403
 *
 * Required env vars (set by e2e.yml):
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_USER_PASSWORD
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.TEST_SUPABASE_URL             ?? ''
const ANON_KEY     = process.env.TEST_SUPABASE_ANON_KEY        ?? ''
const PASSWORD     = process.env.TEST_USER_PASSWORD            ?? ''

if (!SUPABASE_URL || !ANON_KEY || !PASSWORD) {
  const missing = [
    !SUPABASE_URL && 'TEST_SUPABASE_URL',
    !ANON_KEY     && 'TEST_SUPABASE_ANON_KEY',
    !PASSWORD     && 'TEST_USER_PASSWORD',
  ].filter(Boolean).join(', ')
  throw new Error(`E2E search-users: missing required env vars — ${missing}`)
}

const FN_URL = `${SUPABASE_URL}/functions/v1/search-users`

let adminClient:   SupabaseClient
let studentClient: SupabaseClient
let adminToken:    string
let studentToken:  string

beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: adminData, error: adminErr } = await adminClient.auth.signInWithPassword({
    email:    'admin@test.churchcore.dev',
    password: PASSWORD,
  })
  if (adminErr) throw new Error(`Admin sign-in failed: ${adminErr.message}`)
  adminToken = adminData.session?.access_token ?? ''

  studentClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: studentData, error: studentErr } = await studentClient.auth.signInWithPassword({
    email:    'student@test.churchcore.dev',
    password: PASSWORD,
  })
  if (studentErr) throw new Error(`Student sign-in failed: ${studentErr.message}`)
  studentToken = studentData.session?.access_token ?? ''
})

afterAll(async () => {
  try { await adminClient.auth.signOut() }   catch { /* best-effort */ }
  try { await studentClient.auth.signOut() } catch { /* best-effort */ }
})

describe('search-users Edge Function', () => {
  it('returns 200 with results array for an authenticated admin query', async () => {
    const res = await fetch(`${FN_URL}?q=Test`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(200)

    const body = (await res.json()) as { results?: unknown[] }
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.results!.length).toBeGreaterThan(0)

    const first = body.results![0] as Record<string, unknown>
    expect(first).toHaveProperty('id')
    expect(first).toHaveProperty('full_name')
    expect(first).toHaveProperty('email')
  })

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await fetch(`${FN_URL}?q=Test`)
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller has student role', async () => {
    const res = await fetch(`${FN_URL}?q=Test`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    })
    expect(res.status).toBe(403)
  })
})
