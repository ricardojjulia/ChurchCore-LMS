// COUNCIL-2026-031 D4.3 — platform console, as the dedicated platform admin.
// Every tenant operation runs against a throwaway tenant this spec creates and
// removes; the seeded test orgs are never touched.
import { test, expect, asActor, open } from '../../fixtures/test'
import { covers } from '../../fixtures/covers'
import { db, runTag } from '../../fixtures/db'

test.use(asActor('platform'))
test.describe.configure({ mode: 'serial' })

const slug = `suite-${Date.now().toString(36)}`
const name = `${runTag()} Tenant`
const adminEmail = `suite-owner-${Date.now().toString(36)}@test.churchcore.dev`
let orgId = ''

const org = async () => (await db().from('organizations').select('id, name, status, plan, deleted_at, settings').eq('slug', slug).maybeSingle()).data

test.afterAll(async () => {
  if (!orgId) return
  const { data: users } = await db().auth.admin.listUsers({ perPage: 1000 })
  for (const u of users.users.filter((u) => u.email === adminEmail || u.email?.endsWith(`@${slug}.demo`))) {
    await db().auth.admin.deleteUser(u.id)
  }
  await db().from('organizations').delete().eq('id', orgId)
})

test('creates a tenant and invites its admin into it', async ({ page }) => {
  covers('action:platform/actions.createTenant')
  await open(page, '/platform/tenants/new')
  await page.getByLabel('Name*').fill(name)
  await page.getByLabel('Slug*').fill(slug)
  await page.getByLabel('Admin email').fill(adminEmail)
  await page.getByRole('button', { name: 'Create Tenant' }).click()
  await expect(page).toHaveURL(/\/platform\/tenants\/[0-9a-f-]{36}$/)
  orgId = (await org())!.id
  // The invitee must land in the new org as its admin (app_metadata path).
  await expect.poll(async () => (await db().from('profiles').select('org_id, role').eq('email', adminEmail).maybeSingle()).data)
    .toMatchObject({ org_id: orgId, role: 'admin' })
})

test('edits the tenant', async ({ page }) => {
  covers('action:platform/actions.updateTenant')
  await open(page, `/platform/tenants/${orgId}/edit`)
  await page.getByLabel('Plan').selectOption('standard')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect.poll(async () => (await org())?.plan).toBe('standard')
})

test('suspends and restores the tenant', async ({ page }) => {
  covers('action:platform/actions.suspendTenant', 'action:platform/actions.restoreTenant')
  page.on('dialog', (d) => d.accept())
  await open(page, `/platform/tenants/${orgId}`)
  await page.getByRole('button', { name: 'Suspend' }).click()
  await expect.poll(async () => (await org())?.status).toBe('suspended')
  await open(page, `/platform/tenants/${orgId}`)
  await page.getByRole('button', { name: /Restore|Reactivate/ }).click()
  await expect.poll(async () => (await org())?.status).toBe('active')
})

test('resets to demo data, issues a demo login link, then resets to empty', async ({ page }) => {
  covers('action:platform/actions.resetTenantToDemo', 'action:platform/actions.generateDemoLoginLink',
    'action:platform/actions.resetTenantToEmpty')
  // Resets ask the operator to type the organization name.
  page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept(name) : d.accept()))
  const courses = async () => (await db().from('courses').select('id', { count: 'exact', head: true }).eq('org_id', orgId)).count ?? 0

  await open(page, `/platform/tenants/${orgId}`)
  await page.getByLabel('Demo scenario').selectOption('wed_bible_school')
  await page.getByRole('button', { name: 'Reset to Demo' }).click()
  await expect.poll(courses, { timeout: 30_000 }).toBeGreaterThan(0)
  // Demo students are really enrolled (progress/XP read public.enrollments),
  // and no password is stored for the demo accounts.
  await expect.poll(async () => (await db().from('enrollments').select('id', { count: 'exact', head: true }).eq('org_id', orgId)).count ?? 0)
    .toBeGreaterThan(0)
  expect(((await org()) as { settings?: { demo?: Record<string, unknown> } } | null)?.settings?.demo).not.toHaveProperty('password')

  await open(page, `/platform/tenants/${orgId}`)
  await page.getByRole('button', { name: /Open as/ }).first().click()
  await expect(page.getByRole('button', { name: /Copy link/ })).toBeVisible()

  // The one-time link signs in through a server-minted magic link.
  const pending = ((await org()) as { settings?: { demo?: { pending_login?: { token: string } } } } | null)
    ?.settings?.demo?.pending_login
  expect(pending?.token).toBeTruthy()
  const visitor = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] } })
  const vp = await visitor.newPage()
  await vp.goto(`/api/auth/demo-login?t=${pending!.token}&org=${orgId}`)
  await expect(vp).toHaveURL(/\/dashboard/)
  await visitor.close()

  await open(page, `/platform/tenants/${orgId}`)
  await page.getByRole('button', { name: 'Reset to Empty' }).click()
  await expect.poll(courses, { timeout: 30_000 }).toBe(0)
})

test('soft-deletes the tenant', async ({ page }) => {
  covers('action:platform/actions.softDeleteTenant')
  page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept(name) : d.accept()))
  await open(page, `/platform/tenants/${orgId}`)
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect.poll(async () => (await org())?.deleted_at).toBeTruthy()
})

test('triages a feedback item', async ({ page }) => {
  covers('action:platform/feedback/actions.updateFeedbackTriage', 'action:platform/feedback/actions.markFeedbackProcessed')
  const { data: item } = await db().from('platform_feedback').select('id')
    .order('updated_at', { ascending: false }).limit(1).single()
  expect(item).toBeTruthy()
  await db().from('platform_feedback').update({ triage_action: null, processed: false }).eq('id', item!.id)
  const row = async () => (await db().from('platform_feedback').select('triage_action, processed').eq('id', item!.id).single()).data

  await open(page, '/platform/feedback')
  await page.getByLabel('Triage action').first().selectOption('acknowledged')
  await expect.poll(async () => (await row())?.triage_action).toBe('acknowledged')
  await page.getByLabel('Mark as processed').first().check()
  await expect.poll(async () => (await row())?.processed).toBe(true)
})
