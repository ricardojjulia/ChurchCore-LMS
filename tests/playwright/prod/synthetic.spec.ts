// COUNCIL-2026-031 D8 — post-release checks against PRODUCTION, as the
// synthetic-QA tenant's accounts (scripts/prod-synthetic-bootstrap.mjs).
//
// Runs only in the release workflow's "Production synthetic checks" job:
//   SYNTHETIC_BASE_URL          the production app URL
//   SYNTHETIC_PASSWORD          shared password of the synthetic accounts (secret)
//   SYNTHETIC_SUPABASE_URL      production Supabase URL (public)
//   SYNTHETIC_SUPABASE_ANON_KEY production anon key (public)
//
// Constraints: no service role, no AI or Stripe calls, no OneRoster apply.
// The only write is a draft announcement created through the UI and deleted
// with the synthetic admin's own (RLS-scoped) session; a sweep also removes
// "[synthetic" rows older than 24h left by an interrupted run.
import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { covers } from '../fixtures/covers'

const DOMAIN = 'synthetic.churchcore.invalid'
const PASSWORD = process.env.SYNTHETIC_PASSWORD ?? ''
const RUN = `[synthetic ${new Date().toISOString().slice(0, 16)}Z]`

test.skip(!process.env.SYNTHETIC_BASE_URL || !PASSWORD, 'Synthetic production checks are not configured')
test.describe.configure({ mode: 'serial' })

// The same page health bar the CI sweep uses, without importing dev-only fixtures.
async function signIn(page: Page, role: string) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(`${role}@${DOMAIN}`)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
  return errors
}

async function expectHealthy(page: Page, path: string, errors: string[]) {
  const res = await page.goto(path)
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  expect(res?.status() ?? 200, `${path} status`).toBeLessThan(400)
  expect(new URL(page.url()).pathname, `${path} was redirected`).toBe(path)
  await expect(page.locator('body')).not.toContainText(/Application error|Internal Server Error|Something went wrong/i)
  expect(errors, `uncaught errors on ${path}`).toEqual([])
}

test('public: login page and the synthetic join page render', async ({ page }) => {
  covers('page:/login', 'page:/join/[slug]')
  await page.goto('/login')
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await page.goto('/join/synthetic-qa')
  await expect(page).toHaveURL(/\/join\/synthetic-qa$/)
})

const JOURNEYS: Array<[string, string[]]> = [
  ['student', ['/dashboard', '/courses', '/paths', '/certificates', '/messages', '/profile']],
  ['teacher', ['/dashboard', '/courses', '/announcements', '/calendar']],
  ['manager', ['/dashboard', '/admin/reports', '/admin/paths']],
  ['admin', ['/dashboard', '/admin/users', '/admin/settings', '/admin/health']],
  ['guardian', ['/dashboard', '/guardian']],
]

for (const [role, paths] of JOURNEYS) {
  test(`${role}: signs in and core pages render`, async ({ page }) => {
    const errors = await signIn(page, role)
    for (const path of paths) await expectHealthy(page, path, errors)
  })
}

test('student: opens the synthetic course and its lesson', async ({ page }) => {
  const errors = await signIn(page, 'student')
  await page.goto('/courses')
  await page.getByText('Synthetic QA Course').first().click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await expect(page.getByText('Synthetic QA Course').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('guardian: sees the linked synthetic student', async ({ page }) => {
  await signIn(page, 'guardian')
  await page.goto('/guardian')
  await expect(page.getByText('Synthetic Student').first()).toBeVisible()
})

test('admin: health endpoint is green', async ({ page }) => {
  await signIn(page, 'admin')
  const res = await page.request.get('/api/health')
  expect(res.status()).toBe(200)
})

test('admin: announcement draft round trip, cleaned up afterwards', async ({ page }) => {
  const url = process.env.SYNTHETIC_SUPABASE_URL
  const anon = process.env.SYNTHETIC_SUPABASE_ANON_KEY
  test.skip(!url || !anon, 'SYNTHETIC_SUPABASE_URL / SYNTHETIC_SUPABASE_ANON_KEY not set')
  const client: SupabaseClient = createClient(url!, anon!, { auth: { persistSession: false } })
  const { error: signInError } = await client.auth.signInWithPassword({ email: `admin@${DOMAIN}`, password: PASSWORD })
  expect(signInError).toBeNull()

  // Sweep leftovers from interrupted runs (only ever synthetic-tenant rows,
  // enforced by the admin's own RLS scope).
  await client.from('announcements').delete().like('title', '[synthetic %')
    .lt('created_at', new Date(Date.now() - 86_400_000).toISOString())

  const title = `${RUN} Release check`
  await signIn(page, 'admin')
  await page.goto('/announcements/new')
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.getByPlaceholder('Announcement title…').fill(title)
  await page.getByPlaceholder('Write your announcement…').fill('Automated post-release check. Safe to ignore.')
  await page.getByRole('button', { name: 'Save Draft' }).click()
  await expect.poll(async () => (await client.from('announcements').select('id').eq('title', title)).data?.length ?? 0).toBe(1)

  await client.from('announcements').delete().eq('title', title)
  expect((await client.from('announcements').select('id').eq('title', title)).data ?? []).toEqual([])
})
