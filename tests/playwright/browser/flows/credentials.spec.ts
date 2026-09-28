// COUNCIL-2026-045 — people can join, sign in, reset and change their
// password with email and password, and the limits show up in the UI.
import type { Browser, Page } from '@playwright/test'
import { test, expect, asActor, open } from '../../fixtures/test'
import { covers } from '../../fixtures/covers'
import { ORG_A_SLUG } from '../../fixtures/data'
import { createMember, fillThrottle, recoveryTokenHash, suiteEmail, testIp, throttleKey } from '../../fixtures/credentials'

async function freshPage(browser: Browser): Promise<Page> {
  // Own client address per context, so the per-IP limits don't couple tests.
  const ctx = await browser.newContext({ ...asActor('anon'), extraHTTPHeaders: { 'x-forwarded-for': testIp() } })
  return ctx.newPage()
}

// The submit buttons stay disabled until the page has hydrated and the bot
// check has a token, so waiting for them avoids typing into a page that
// hydration would reset.
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('a new member joins with a password, signs out, and signs back in', async ({ browser }) => {
  covers('page:/join/[slug]', 'page:/login')
  const email = suiteEmail()
  const password = 'Suite join pass 1'
  const page = await freshPage(browser)
  await page.goto(`/join/${ORG_A_SLUG}`)
  await expect(page.getByRole('button', { name: /^Join / })).toBeEnabled()
  await page.getByLabel('Full name').fill('Suite Joiner')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /^Join / }).click()
  await page.waitForURL(/\/dashboard/)

  await page.context().clearCookies()
  await signIn(page, email, password)
  await page.waitForURL(/\/dashboard/)
  await page.context().close()
})

test('join refuses a common password and lets the member try again', async ({ browser }) => {
  const page = await freshPage(browser)
  await page.goto(`/join/${ORG_A_SLUG}`)
  await expect(page.getByRole('button', { name: /^Join / })).toBeEnabled()
  await page.getByLabel('Full name').fill('Suite Joiner')
  await page.getByLabel('Email address').fill(suiteEmail())
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: /^Join / }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'That password is too common' })).toBeVisible()

  // The bot check was reset, so a corrected attempt goes through.
  await page.getByLabel('Password').fill('Suite join pass 2')
  await page.getByRole('button', { name: /^Join / }).click()
  await page.waitForURL(/\/dashboard/)
  await page.context().close()
})

test('a wrong password shows one generic message; a locked account says to wait', async ({ browser }) => {
  const user = await createMember()
  const page = await freshPage(browser)
  await signIn(page, user.email, 'not-the-password')
  await expect(page.getByRole('alert').filter({ hasText: 'Email or password is incorrect.' })).toBeVisible()
  await expect(page).toHaveURL(/\/login/)

  await fillThrottle(throttleKey('login', 'email', user.email), 10)
  // The bot check resets after each attempt; the button waits for a new token.
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert').filter({ hasText: /Too many sign-in attempts\. Try again in \d+ minutes?\./ })).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
  await page.context().close()
})

test('a reset link lets the member choose a new password; the old one stops working', async ({ browser }) => {
  covers('page:/account/password', 'action:account.updatePassword')
  const user = await createMember()
  const page = await freshPage(browser)
  await page.goto(`/auth/reset?token_hash=${encodeURIComponent(await recoveryTokenHash(user.email))}`)
  await page.waitForURL(/\/account\/password\?reset=1/)
  await expect(page.getByLabel('Current password')).toHaveCount(0)
  await page.getByLabel('New password', { exact: true }).fill('Suite new pass 1')
  await page.getByLabel('Confirm new password').fill('Suite new pass 1')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Password saved.' })).toBeVisible()
  await page.context().close()

  const old = await freshPage(browser)
  await signIn(old, user.email, user.password)
  await expect(old.getByRole('alert').filter({ hasText: 'Email or password is incorrect.' })).toBeVisible()
  await old.context().close()

  const fresh = await freshPage(browser)
  await signIn(fresh, user.email, 'Suite new pass 1')
  await fresh.waitForURL(/\/dashboard/)
  await fresh.context().close()
})

test('changing a password from the profile needs the current one', async ({ browser }) => {
  const user = await createMember()
  const page = await freshPage(browser)
  await signIn(page, user.email, user.password)
  await page.waitForURL(/\/dashboard/)
  await open(page, '/profile')
  await page.getByRole('link', { name: 'Save password' }).click()
  await page.waitForURL(/\/account\/password$/)

  await page.getByLabel('Current password').fill('not-the-password')
  await page.getByLabel('New password', { exact: true }).fill('Suite changed 1')
  await page.getByLabel('Confirm new password').fill('Suite changed 1')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Your current password is incorrect.' })).toBeVisible()

  await page.getByLabel('Current password').fill(user.password)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Password saved.' })).toBeVisible()
  await page.context().close()
})

test('the forgot-password page explains when reset email is unavailable, and a stale link', async ({ browser }) => {
  covers('page:/forgot-password')
  const page = await freshPage(browser)
  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await page.waitForURL(/\/forgot-password$/)
  await page.getByLabel('Email').fill(suiteEmail())
  await page.getByRole('button', { name: 'Email me a reset link' }).click()
  // The suite has no email provider.
  await expect(page.getByRole('alert').filter({ hasText: 'isn’t available on this site yet' })).toBeVisible()

  await page.goto('/auth/reset?token_hash=expired-token')
  await page.waitForURL(/\/forgot-password\?error=invalid_link/)
  await expect(page.getByRole('alert').filter({ hasText: 'That reset link is invalid or has expired.' })).toBeVisible()
  await page.context().close()
})
