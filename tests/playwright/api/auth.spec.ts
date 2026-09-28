// COUNCIL-2026-045 — password sign-in, reset request and reset links:
// limits, bot check, and no account enumeration.
import { test, expect } from '@playwright/test'
import { covers } from '../fixtures/covers'
import { db } from '../fixtures/db'
import { createMember, fillThrottle, recoveryTokenHash, suiteEmail, testIp, throttleKey } from '../fixtures/credentials'

const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX' // accepted by the suite's always-pass Turnstile secret

test.describe('POST /api/auth/login', () => {
  test('signs in with the right password and sets the session cookie', async ({ request }) => {
    covers('api:POST /api/auth/login')
    const user = await createMember()
    const res = await request.post('/api/auth/login', {
      headers: { 'x-forwarded-for': testIp() },
      data: { email: user.email, password: user.password, turnstileToken: TOKEN },
    })
    expect(res.status()).toBe(200)
    expect(res.headers()['set-cookie'] ?? '').toMatch(/sb-.*-auth-token/)
  })

  test('validates input and requires the bot check', async ({ request }) => {
    const headers = { 'x-forwarded-for': testIp() }
    expect((await request.post('/api/auth/login', { headers, data: { email: 'nope', password: 'x', turnstileToken: TOKEN } })).status()).toBe(400)
    const res = await request.post('/api/auth/login', { headers, data: { email: suiteEmail(), password: 'whatever1' } })
    expect(res.status()).toBe(400)
    expect((await res.json()).code).toBe('captcha')
  })

  test('answers a wrong password and an unknown email identically', async ({ request }) => {
    const user = await createMember()
    const headers = { 'x-forwarded-for': testIp() }
    const wrong = await request.post('/api/auth/login', { headers, data: { email: user.email, password: 'not-the-password', turnstileToken: TOKEN } })
    const unknown = await request.post('/api/auth/login', { headers, data: { email: suiteEmail(), password: 'not-the-password', turnstileToken: TOKEN } })
    expect(wrong.status()).toBe(401)
    expect(unknown.status()).toBe(401)
    expect(await wrong.json()).toEqual(await unknown.json())
    expect(wrong.headers()['set-cookie'] ?? '').not.toMatch(/sb-.*-auth-token/)
  })

  test('locks an account after too many attempts, even with the right password', async ({ request }) => {
    const user = await createMember()
    await fillThrottle(throttleKey('login', 'email', user.email), 10)
    const res = await request.post('/api/auth/login', {
      headers: { 'x-forwarded-for': testIp() },
      data: { email: user.email, password: user.password, turnstileToken: TOKEN },
    })
    expect(res.status()).toBe(429)
    expect(Number(res.headers()['retry-after'])).toBeGreaterThan(0)
    expect(res.headers()['set-cookie'] ?? '').not.toMatch(/sb-.*-auth-token/)
  })

  test('limits one address across many accounts', async ({ request }) => {
    const ip = testIp()
    await fillThrottle(throttleKey('login', 'ip', ip), 30)
    const res = await request.post('/api/auth/login', {
      headers: { 'x-forwarded-for': ip },
      data: { email: suiteEmail(), password: 'whatever1', turnstileToken: TOKEN },
    })
    expect(res.status()).toBe(429)
    const { count } = await db().from('auth_security_events').select('id', { count: 'exact', head: true })
      .eq('event', 'login_throttled').eq('ip_hash', throttleKey('x', 'ip', ip).slice(2))
    expect(count).toBeGreaterThan(0)
  })
})

test.describe('POST /api/auth/forgot', () => {
  test('says reset email is unavailable when the site has no email provider', async ({ request }) => {
    covers('api:POST /api/auth/forgot')
    const res = await request.post('/api/auth/forgot', {
      headers: { 'x-forwarded-for': testIp() },
      data: { email: suiteEmail(), turnstileToken: TOKEN },
    })
    expect(res.status()).toBe(503)
    expect((await res.json()).code).toBe('unavailable')
  })
})

test.describe('GET /auth/reset', () => {
  test('a valid link signs in and goes to choosing a password; a bad one goes back', async ({ request }) => {
    covers('api:GET /auth/reset')
    const user = await createMember()
    const ok = await request.get(`/auth/reset?token_hash=${encodeURIComponent(await recoveryTokenHash(user.email))}`, { maxRedirects: 0 })
    expect(ok.status()).toBe(303)
    expect(ok.headers()['location']).toBe('/account/password?reset=1')
    expect(ok.headers()['set-cookie'] ?? '').toMatch(/sb-.*-auth-token/)

    for (const path of ['/auth/reset', '/auth/reset?token_hash=not-a-real-token']) {
      const bad = await request.get(path, { maxRedirects: 0 })
      expect(bad.status()).toBe(303)
      expect(bad.headers()['location']).toMatch(/\/forgot-password\?error=invalid_link$/)
    }
  })
})
