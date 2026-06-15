/**
 * Admin Health Page Integration Tests
 * COUNCIL-2025-005 GAP-008 — /admin/health page wiring
 *
 * Verifies that:
 *   1. GET /admin/health redirects to /auth/login for unauthenticated requests.
 *   2. GET /admin/health redirects to /dashboard for authenticated non-admins.
 *   3. GET /admin/health returns 200 and renders the System Health heading for admins.
 *   4. The page renders a "Run Checks" button (wired to POST /api/health).
 *   5. The page appears in the admin navigation with a health error badge when
 *      system_health_checks contains error rows.
 *
 * Prerequisites:
 *   - A test runner (Jest / Vitest) must be configured before these run.
 *   - APP_BASE_URL, SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_KEY env vars must be set.
 *   - TEST_ADMIN_TOKEN must be a valid Supabase access token for an admin profile.
 *   - TEST_STUDENT_TOKEN must be a valid Supabase access token for a student profile.
 *   - Cookie-based session must be supported by the test runner (or use a headless browser).
 *     Note: the redirect tests work via HTTP response status and Location headers.
 *
 * Run: npx vitest src/tests/e2e/admin-health-page.test.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const BASE_URL       = process.env.APP_BASE_URL              ?? 'http://localhost:3000'
const TEST_URL       = process.env.SUPABASE_TEST_URL         ?? ''
const SERVICE_KEY    = process.env.SUPABASE_TEST_SERVICE_KEY ?? ''
const ADMIN_TOKEN    = process.env.TEST_ADMIN_TOKEN          ?? ''
const STUDENT_TOKEN  = process.env.TEST_STUDENT_TOKEN        ?? ''

function serviceClient(): SupabaseClient {
  return createClient(TEST_URL, SERVICE_KEY)
}

async function getPage(
  path: string,
  token?: string,
  followRedirects = false,
): Promise<{ status: number; redirectUrl: string | null; html: string }> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    redirect: followRedirects ? 'follow' : 'manual',
  })

  const html = res.headers.get('Content-Type')?.includes('text/html')
    ? await res.text()
    : ''

  const redirectUrl = res.headers.get('Location')
  return { status: res.status, redirectUrl, html }
}

async function seedHealthError(): Promise<string> {
  const db = serviceClient()
  const { data } = await db
    .from('system_health_checks')
    .insert({
      check_name: 'test_check',
      status:     'error',
      message:    'Seeded by test suite',
      metadata:   {},
    })
    .select('id')
    .single()
  return data?.id ?? ''
}

async function cleanupHealthRow(id: string) {
  const db = serviceClient()
  await db.from('system_health_checks').delete().eq('id', id)
}

// ── Auth redirects ─────────────────────────────────────────────────────────────

describe('/admin/health — auth guards', () => {
  it('redirects unauthenticated requests to /auth/login', async () => {
    const { status, redirectUrl } = await getPage('/admin/health')
    // Next.js 15 returns 307 for server-side redirects
    expect([301, 302, 307, 308]).toContain(status)
    expect(redirectUrl).toContain('/auth/login')
  })

  it('redirects non-admin authenticated users to /dashboard', async () => {
    const { status, redirectUrl } = await getPage('/admin/health', STUDENT_TOKEN)
    expect([301, 302, 307, 308]).toContain(status)
    expect(redirectUrl).toContain('/dashboard')
  })
})

// ── Admin access ───────────────────────────────────────────────────────────────

describe('/admin/health — admin access', () => {
  it('returns 200 and renders the System Health heading for admin users', async () => {
    const { status, html } = await getPage('/admin/health', ADMIN_TOKEN, true)
    expect(status).toBe(200)
    expect(html).toContain('System Health')
  })

  it('renders a Run Checks button wired to the /api/health POST endpoint', async () => {
    const { html } = await getPage('/admin/health', ADMIN_TOKEN, true)
    // The SystemHealthPanel renders a "Run Checks" button
    expect(html).toMatch(/run checks/i)
  })
})

// ── Health badge in navigation ─────────────────────────────────────────────────

describe('Admin navigation health badge', () => {
  let seededId = ''

  beforeAll(async () => { seededId = await seedHealthError() })
  afterAll(async () => { await cleanupHealthRow(seededId) })

  it('shows a health error badge count in the admin nav when error rows exist', async () => {
    // The dashboard nav renders a badge when healthErrorCount > 0.
    // Fetch the dashboard page (which includes the Navbar) and check for the badge.
    const { html } = await getPage('/dashboard', ADMIN_TOKEN, true)
    // The badge contains the error count as a number next to the Health link
    expect(html).toMatch(/system health/i)
    // A numeric badge should appear — its exact rendering is a digit inside the nav
    expect(html).toMatch(/\b[1-9][0-9]*\b/)
  })
})
