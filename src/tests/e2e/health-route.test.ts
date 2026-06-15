/**
 * Health Route Integration Tests
 * COUNCIL-2025-005 GAP-006 — /api/health route wiring
 *
 * Verifies that:
 *   1. GET /api/health returns 401 when unauthenticated.
 *   2. GET /api/health returns 403 when authenticated as a non-admin.
 *   3. GET /api/health returns 200 with a checks array for an admin user.
 *   4. POST /api/health triggers the system-health-check Edge Function and
 *      returns freshly persisted rows.
 *   5. POST /api/health returns 401 when unauthenticated.
 *
 * Prerequisites:
 *   - A test runner (Jest / Vitest) must be configured before these run.
 *   - APP_BASE_URL, SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_KEY env vars must be set.
 *   - TEST_ADMIN_TOKEN must be a valid Supabase access token for an admin profile.
 *   - TEST_STUDENT_TOKEN must be a valid Supabase access token for a student profile.
 *   - The system-health-check Edge Function must be deployed in the test project.
 *
 * Run: npx vitest src/tests/e2e/health-route.test.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const BASE_URL     = process.env.APP_BASE_URL                ?? 'http://localhost:3000'
const TEST_URL     = process.env.SUPABASE_TEST_URL           ?? ''
const SERVICE_KEY  = process.env.SUPABASE_TEST_SERVICE_KEY   ?? ''
const ADMIN_TOKEN  = process.env.TEST_ADMIN_TOKEN            ?? ''
const STUDENT_TOKEN = process.env.TEST_STUDENT_TOKEN         ?? ''

function serviceClient(): SupabaseClient {
  return createClient(TEST_URL, SERVICE_KEY)
}

async function getJson(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, { method, headers })
  let body: unknown
  try { body = await res.json() } catch { body = null }
  return { status: res.status, body }
}

async function cleanupHealthChecks() {
  const db = serviceClient()
  await db.from('system_health_checks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
}

// ── Authentication guard ───────────────────────────────────────────────────────

describe('GET /api/health — auth guards', () => {
  it('returns 401 when no token is provided', async () => {
    const { status } = await getJson('/api/health')
    expect(status).toBe(401)
  })

  it('returns 403 when authenticated as a non-admin (student)', async () => {
    const { status } = await getJson('/api/health', 'GET', STUDENT_TOKEN)
    expect(status).toBe(403)
  })
})

// ── GET /api/health ────────────────────────────────────────────────────────────

describe('GET /api/health — admin access', () => {
  it('returns 200 with a checks array for an admin user', async () => {
    const { status, body } = await getJson('/api/health', 'GET', ADMIN_TOKEN)

    expect(status).toBe(200)
    expect(body).toHaveProperty('checks')
    expect(Array.isArray((body as { checks: unknown[] }).checks)).toBe(true)
  })

  it('returns a timestamp field alongside the checks', async () => {
    const { body } = await getJson('/api/health', 'GET', ADMIN_TOKEN)
    const typed = body as { timestamp?: string }
    expect(typeof typed.timestamp).toBe('string')
    // Should parse as a valid ISO date
    expect(Number.isNaN(Date.parse(typed.timestamp ?? ''))).toBe(false)
  })
})

// ── POST /api/health ───────────────────────────────────────────────────────────

describe('POST /api/health — trigger + persist', () => {
  afterAll(() => cleanupHealthChecks())

  it('returns 401 when no token is provided', async () => {
    const { status } = await getJson('/api/health', 'POST')
    expect(status).toBe(401)
  })

  it('returns 200 and persists check rows after invoking the Edge Function', async () => {
    const { status, body } = await getJson('/api/health', 'POST', ADMIN_TOKEN)

    expect(status).toBe(200)
    const typed = body as { checks: { check_name: string; status: string }[] }
    expect(Array.isArray(typed.checks)).toBe(true)
    expect(typed.checks.length).toBeGreaterThan(0)

    // Verify the rows actually landed in the DB
    const db = serviceClient()
    const { count } = await db
      .from('system_health_checks')
      .select('id', { count: 'exact', head: true })
    expect((count ?? 0)).toBeGreaterThan(0)
  })
})
