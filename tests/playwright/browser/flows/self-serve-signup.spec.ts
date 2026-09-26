// COUNCIL-2026-034 — a church signs itself up, lands in its trial, and after
// the trial ends its admin can still reach checkout (Amendments 7 and 8).
import { createHash, randomBytes } from 'node:crypto'
import { test, expect, asActor, open } from '../../fixtures/test'
import { covers } from '../../fixtures/covers'
import { db, runTag } from '../../fixtures/db'

test.use(asActor('anon'))

test('the signup form renders with every field labelled', async ({ page }) => {
  covers('page:/start')
  await open(page, '/start')
  for (const label of ['Church or ministry name', 'Web address', 'Your name', 'Your email', 'Language']) {
    await expect(page.getByLabel(label)).toBeVisible()
  }
  // The web address follows the church name until edited.
  await page.getByLabel('Church or ministry name').fill('Grace Community Church')
  await expect(page.getByLabel('Web address')).toHaveValue('grace-community-church')
})

test('verify → onboarding → trial banner → trial ends → renewal page offers plans', async ({ page }) => {
  covers('page:/billing/renew')
  const tag = runTag().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const slug = `f-${tag}`.slice(0, 40).replace(/-+$/, '')
  const email = `suite-${tag}@test.churchcore.dev`
  const token = randomBytes(32).toString('base64url')
  await db().from('pending_signups').insert({
    token_hash: createHash('sha256').update(token).digest('hex'),
    email, slug, expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    payload: { churchName: 'Suite Flow Church', slug, adminName: 'Suite Flow Admin', email, timezone: 'America/Chicago', locale: 'en' },
  })

  await page.goto(`/api/signup/verify?token=${token}`)
  await expect(page).toHaveURL(/\/onboarding/)

  await open(page, '/dashboard')
  await expect(page.getByText(/Free trial: 14 days left/)).toBeVisible()

  // The trial ends: the org is suspended, which now cuts member access
  // automatically (Amendment 7), and the admin is sent to renewal (Amendment 8).
  const { data: org } = await db().from('organizations').select('id').eq('slug', slug).single()
  await db().from('organizations').update({ status: 'suspended', trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() }).eq('id', org!.id)
  const { data: roleRow } = await db().from('profile_roles').select('tenant_active').eq('org_id', org!.id).single()
  expect(roleRow?.tenant_active).toBe(false)

  await open(page, '/dashboard')
  await expect(page).toHaveURL(/\/billing\/renew/)
  await expect(page.getByRole('heading', { name: 'The free trial for Suite Flow Church has ended' })).toBeVisible()
  // Stripe isn't configured in the suite (the API spec covers its clean 502),
  // so stand in for it: the page must send only the plan — never an org id,
  // which the server resolves — and follow the checkout URL it gets back.
  let sent: Record<string, unknown> | null = null
  await page.route('**/api/stripe/create-checkout', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: '/billing/renew?checkout=stub' }) })
  })
  await page.getByRole('button', { name: /Starter/ }).click()
  await expect(page).toHaveURL(/checkout=stub/)
  expect(sent).toMatchObject({ priceId: 'price_suite_starter' })
  expect(sent).not.toHaveProperty('orgId')

  // Paying (simulated) reactivates access without any manual sync.
  await db().from('organizations').update({ status: 'active' }).eq('id', org!.id)
  await open(page, '/dashboard')
  await expect(page).toHaveURL(/\/dashboard/)

  const { data: admin } = await db().from('profiles').select('auth_id').eq('email', email).single()
  await db().auth.admin.deleteUser(admin!.auth_id)
  await db().from('organizations').delete().eq('id', org!.id)
})
