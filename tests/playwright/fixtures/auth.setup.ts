// Signs every seeded role in through the real /login form once per run and
// saves its session as storageState for the api/browser projects.
import { test as setup, expect } from '@playwright/test'
import { ROLES, USERS, storageStatePath } from './roles'
import { covers } from './covers'

setup.beforeAll(() => {
  // Guard rail: the suite seeds and mutates data. It must never point at a
  // hosted Supabase project (a local .env once pointed tests at production).
  const url = process.env.TEST_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    throw new Error(`Refusing to run: Supabase URL "${url || '(unset)'}" is not a local stack.`)
  }
  if (!process.env.TEST_USER_PASSWORD) throw new Error('TEST_USER_PASSWORD is not set')
})

for (const role of ROLES) {
  setup(`sign in as ${role}`, async ({ page }) => {
    covers('page:/login')
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(USERS[role].email)
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD!)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
    await expect(page).not.toHaveURL(/\/login/)
    await page.context().storageState({ path: storageStatePath(role) })
  })
}

setup('rejects a wrong password and stays on /login', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(USERS.student.email)
  await page.locator('input[type="password"]').fill('definitely-not-the-password')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('alert').or(page.locator('text=/invalid|incorrect|credentials/i')).first()).toBeVisible()
})
