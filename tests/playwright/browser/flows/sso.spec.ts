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

// Policy tests run against a throwaway organization: turning passwords off on a
// shared test org would sign out every parallel test that uses it.
test.describe('organization sign-in policy', () => {
  test.describe.configure({ mode: 'serial' })
  let orgId = ''
  let admin = { id: '', email: '', password: '' }
  const users: string[] = []

  test.beforeAll(async () => {
    const t = tag()
    const { data: org, error } = await db().from('organizations')
      .insert({ name: `Suite Policy ${t}`, slug: `pol-${t}`.slice(0, 40).replace(/-+$/, ''), status: 'active', plan: 'free', settings: {} })
      .select('id').single()
    if (error) throw error
    orgId = org!.id
    const email = `suite-${t}-admin@test.churchcore.dev`
    const created = await createUser(email, { org_id: orgId, role: 'admin' })
    admin = { id: created.id, email, password: created.password }
    users.push(created.id)
  })
  test.afterAll(async () => {
    for (const id of users) await db().auth.admin.deleteUser(id)
    if (orgId) await db().from('organizations').delete().eq('id', orgId)
  })

  test('refuses settings that would sign the admin out', async ({ browser }) => {
    covers('action:org-settings.updateAuthPolicy')
    const page = await signIn(browser, admin.email, admin.password)
    await page.waitForURL(/\/dashboard/)
    await open(page, '/admin/settings')
    await page.getByLabel('Allowed email domains').fill('grace.example')
    await page.getByRole('button', { name: 'Save sign-in settings' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Your own email domain must be in the allowed list.' })).toBeVisible()

    await page.getByLabel('Allowed email domains').fill('')
    await page.getByRole('checkbox', { name: /Require Google or Microsoft sign-in for staff/ }).check()
    await page.getByRole('button', { name: 'Save sign-in settings' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Sign in with Google or Microsoft first' })).toBeVisible()
    await page.context().close()
  })

  test('an allowed-domain rule signs out members from other domains', async ({ browser }) => {
    covers('api:GET /auth/sign-out')
    const page = await signIn(browser, admin.email, admin.password)
    await page.waitForURL(/\/dashboard/)
    await open(page, '/admin/settings')
    await page.getByLabel('Allowed email domains').fill('test.churchcore.dev')
    await page.getByRole('button', { name: 'Save sign-in settings' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Sign-in settings saved.' })).toBeVisible()
    await page.context().close()

    const outsider = await createUser(`suite-${tag()}@example.org`, { org_id: orgId, role: 'student' })
    users.push(outsider.id)
    const { data: u } = await db().auth.admin.getUserById(outsider.id)
    const outsiderPage = await signIn(browser, u.user!.email!, outsider.password)
    await expect(outsiderPage).toHaveURL(/\/login\?error=domain_not_allowed/)
    await expect(outsiderPage.getByText('Your church only allows sign-in with its own email addresses.')).toBeVisible()
    await outsiderPage.context().close()
  })

  test('with passwords turned off, a password session is signed out', async ({ browser }) => {
    await db().from('organizations').update({
      settings: { auth: { disable_password: true, require_sso_for_staff: false, allowed_domains: [] } },
    }).eq('id', orgId)
    const member = await createUser(`suite-${tag()}@test.churchcore.dev`, { org_id: orgId, role: 'student' })
    users.push(member.id)
    const { data: u } = await db().auth.admin.getUserById(member.id)
    const page = await signIn(browser, u.user!.email!, member.password)
    await expect(page).toHaveURL(/\/login\?error=password_disabled/)
    await expect(page.getByText('Your church has turned off password sign-in. Use Google or Microsoft.')).toBeVisible()
    await page.context().close()
  })
})
