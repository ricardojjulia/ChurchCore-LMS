// @vitest-environment node
// POST /api/auth/login (COUNCIL-2026-045): limits, bot check, generic errors.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { covers } from '../../../../tests/covers'

covers('api:POST /api/auth/login')

const m = vi.hoisted(() => ({
  limits: {} as Record<string, boolean>,
  events: [] as string[],
  cleared: [] as string[],
  signIn: vi.fn(),
  captchaConfigured: true,
}))

vi.mock('@/lib/turnstile', () => ({
  turnstileConfigured: () => m.captchaConfigured,
  verifyTurnstile: async (t: string | null) => t === 'ok',
}))
vi.mock('@/lib/auth-throttle', async (orig) => {
  const real = await orig<typeof import('@/lib/auth-throttle')>()
  return {
    ...real,
    hit: async (_scope: string, key: string) => ({ allowed: m.limits[key.split(':')[0]] !== false, retryAfter: 300 }),
    clear: async (_scope: string, key: string) => { m.cleared.push(key) },
    recordEvent: async (event: string) => { m.events.push(event) },
  }
})
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { signInWithPassword: m.signIn } }),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'

const request = (data: unknown) =>
  new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', body: JSON.stringify(data),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
  })
const creds = (over: Record<string, unknown> = {}) => ({ email: 'ana@grace.org', password: 'correct horse', turnstileToken: 'ok', ...over })

beforeEach(() => {
  m.limits = {}; m.events = []; m.cleared = []; m.captchaConfigured = true
  m.signIn.mockReset().mockResolvedValue({ error: null })
})

describe('POST /api/auth/login', () => {
  it('signs in and clears the per-email counter (happy path)', async () => {
    const res = await POST(request(creds()))
    expect(res.status).toBe(200)
    expect(m.signIn).toHaveBeenCalledWith({ email: 'ana@grace.org', password: 'correct horse' })
    expect(m.cleared).toHaveLength(1)
  })

  it('rejects malformed input before anything else', async () => {
    expect((await POST(request(creds({ email: 'nope' })))).status).toBe(400)
    expect((await POST(request(creds({ password: '' })))).status).toBe(400)
    expect(m.signIn).not.toHaveBeenCalled()
  })

  it('requires the bot check when configured, and skips it when not', async () => {
    const res = await POST(request(creds({ turnstileToken: 'bad' })))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('captcha')
    expect(m.events).toContain('captcha_failed')

    m.captchaConfigured = false
    expect((await POST(request(creds({ turnstileToken: undefined })))).status).toBe(200)
  })

  it('gives the same answer for every credential failure', async () => {
    for (const message of ['Invalid login credentials', 'Email not confirmed']) {
      m.signIn.mockResolvedValueOnce({ error: { status: 400, message } })
      const res = await POST(request(creds()))
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Email or password is incorrect.', code: 'invalid_credentials' })
    }
    expect(m.events.filter((e) => e === 'login_failed')).toHaveLength(2)
    expect(m.cleared).toHaveLength(0)
  })

  it('throttles per IP and per email with Retry-After', async () => {
    m.limits.ip = false
    let res = await POST(request(creds()))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('300')
    expect((await res.json()).minutes).toBe(5)

    m.limits = { email: false }
    res = await POST(request(creds()))
    expect(res.status).toBe(429)
    expect(m.signIn).not.toHaveBeenCalled()
    expect(m.events).toEqual(['login_throttled', 'login_throttled'])
  })

  it('maps Supabase Auth rate limiting to a 429', async () => {
    m.signIn.mockResolvedValueOnce({ error: { status: 429, message: 'rate limited' } })
    expect((await POST(request(creds()))).status).toBe(429)
  })
})
