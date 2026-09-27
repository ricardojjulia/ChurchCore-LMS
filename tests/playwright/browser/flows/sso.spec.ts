// COUNCIL-2026-037 — Google/Microsoft sign-in, the no-org landing, the SSO
// join step, and the organization sign-in policy.
import { randomUUID } from 'node:crypto'
import type { Browser, Page } from '@playwright/test'
import { test, expect, asActor, open } from '../../fixtures/test'
import { covers } from '../../fixtures/covers'
import { ORG_A, ORG_A_SLUG } from '../../fixtures/data'
import { db, runTag } from '../../fixtures/db'

const tag = () => runTag().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function createUser(email: string, appMetadata?: Record<string, string>) {
  const password = `P-${randomUUID()}`
  const { data, error } = await db().auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: 'Suite SSO User' },
    ...(appMetadata ? { app_metadata: appMetadata } : {}),
  })
  if (error) throw error
  return { id: data.user!.id, password }
}

async function signIn(browser: Browser, email: string, password: string): Promise<Page> {
  const ctx = await browser.newContext(asActor('anon'))
  const page = await ctx.newPage()
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /Sign in/i }).click()
  return page
}

test.describe('sign-in buttons', () => {
  test.use(asActor('anon'))
  test('Continue with Google goes to the provider with a same-site callback', async ({ page }) => {
    let authorizeUrl = ''
    await page.route('**/auth/v1/authorize**', async (route) => {
      authorizeUrl = route.request().url()
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>provider</p>' })
    })
    await open(page, '/login')
    await expect(page.getByRole('button', { name: 'Continue with Microsoft' })).toBeVisible()
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    await expect.poll(() => authorizeUrl).toContain('provider=google')
    const redirectTo = new URL(authorizeUrl).searchParams.get('redirect_to') ?? ''
    expect(new URL(redirectTo).pathname).toBe('/callback')
    expect(new URL(redirectTo).searchParams.get('next')).toBe('/dashboard')
  })
})

test('an account with no organization lands on /welcome, then joins through the SSO join step', async ({ browser }) => {
  covers('page:/welcome', 'api:GET /join/[slug]/complete')
  const email = `suite-${tag()}@test.churchcore.dev`
  const user = await createUser(email) // no app_metadata: like a first "Continue with Google"
  const page = await signIn(browser, email, user.password)
  await expect(page).toHaveURL(/\/welcome/)
  await expect(page.getByRole('heading', { name: "Your account isn't connected to a church yet" })).toBeVisible()

  await page.goto(`/join/${ORG_A_SLUG}/complete`)
  await expect(page).toHaveURL(/\/dashboard/)
  const { data: profile } = await db().from('profiles').select('org_id, role').eq('auth_id', user.id).single()
  expect(profile).toMatchObject({ org_id: ORG_A, role: 'student' })

  // Already a member: the join step doesn't change anything.
  await page.goto(`/join/${ORG_A_SLUG}/complete`)
  await expect(page).toHaveURL(/\/dashboard/)
  await page.context().close()
  await db().auth.admin.deleteUser(user.id)
})

test.describe('organization sign-in policy', () => {
  test.describe.configure({ mode: 'serial' })
  test.use(asActor('admin'))

  const resetPolicy = async () => {
    const { data } = await db().from('organizations').select('settings').eq('id', ORG_A).single()
    const settings = { ...(data?.settings ?? {}) } as Record<string, unknown>
    delete settings.auth
    await db().from('organizations').update({ settings }).eq('id', ORG_A)
  }
  test.beforeAll(resetPolicy)
  test.afterAll(resetPolicy)

  test('refuses settings that would sign the admin out', async ({ page }) => {
    covers('action:org-settings.updateAuthPolicy')
    await open(page, '/admin/settings')
    await page.getByLabel('Allowed email domains').fill('grace.example')
    await page.getByRole('button', { name: 'Save sign-in settings' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Your own email domain must be in the allowed list.' })).toBeVisible()

    await page.getByLabel('Allowed email domains').fill('')
    await page.getByRole('checkbox', { name: /Require Google or Microsoft sign-in for staff/ }).check()
    await page.getByRole('button', { name: 'Save sign-in settings' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Sign in with Google or Microsoft first' })).toBeVisible()
  })

  test('an allowed-domain rule signs out members from other domains', async ({ page, browser }) => {
    covers('api:GET /auth/sign-out')
    await open(page, '/admin/settings')
    await page.getByLabel('Allowed email domains').fill('test.churchcore.dev')
    await page.getByRole('button', { name: 'Save sign-in settings' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Sign-in settings saved.' })).toBeVisible()

    const outsider = await createUser(`suite-${tag()}@example.org`, { org_id: ORG_A, role: 'student' })
    // Sign the outsider in and confirm the session is ended with an explanation.
    const { data: u } = await db().auth.admin.getUserById(outsider.id)
    const outsiderPage = await signIn(browser, u.user!.email!, outsider.password)
    await expect(outsiderPage).toHaveURL(/\/login\?error=domain_not_allowed/)
    await expect(outsiderPage.getByText('Your church only allows sign-in with its own email addresses.')).toBeVisible()
    await outsiderPage.context().close()
    await db().auth.admin.deleteUser(outsider.id)
  })
})
