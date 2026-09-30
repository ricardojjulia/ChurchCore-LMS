// @vitest-environment node
// POST /api/auth/forgot (COUNCIL-2026-045). The browser/API suite has no
// email provider, so the send path is covered here.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { covers } from '../../../../tests/covers'

covers('api:POST /api/auth/forgot')

const m = vi.hoisted(() => ({
  limits: {} as Record<string, boolean>,
  events: [] as string[],
  profile: null as { uid: string } | null,
  sent: [] as Array<{ to: string; subject: string; actionUrl: string; locale: string }>,
  generateLink: vi.fn(),
}))

vi.mock('@/lib/turnstile', () => ({ turnstileConfigured: () => true, verifyTurnstile: async (t: string | null) => t === 'ok' }))
vi.mock('@/lib/auth-throttle', async (orig) => {
  const real = await orig<typeof import('@/lib/auth-throttle')>()
  return {
    ...real,
    hit: async (_scope: string, key: string) => ({ allowed: m.limits[key.split(':')[0]] !== false, retryAfter: 60 }),
    recordEvent: async (event: string) => { m.events.push(event) },
  }
})
vi.mock('@/lib/email', () => ({
  sendEmail: async ({ to, subject, react }: { to: string; subject: string; react: { props: { actionUrl: string; locale: string } } }) => {
    m.sent.push({ to, subject, actionUrl: react.props.actionUrl, locale: react.props.locale })
  },
}))
vi.mock('@/emails/PasswordResetEmail', () => ({ default: (props: unknown) => ({ props }) }))
vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      for (const k of ['select', 'ilike', 'limit']) q[k] = () => q
      q.maybeSingle = async () => ({ data: m.profile })
      return q
    },
    auth: { admin: { generateLink: m.generateLink } },
  }),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'

const request = (data: unknown) =>
  new NextRequest('http://localhost/api/auth/forgot', {
    method: 'POST', body: JSON.stringify(data),
    headers: { 'content-type': 'application/json', host: 'evil.example' },
  })

beforeEach(() => {
  process.env.APP_BASE_URL = 'https://lms.example.org'
  process.env.RESEND_API_KEY = 're_test'
  m.limits = {}; m.events = []; m.sent = []; m.profile = null
  m.generateLink.mockReset().mockResolvedValue({ data: { properties: { hashed_token: 'abc/123' } } })
})

describe('POST /api/auth/forgot', () => {
  it('emails a reset link on this site to an existing account (happy path)', async () => {
    m.profile = { uid: 'u1' }
    const res = await POST(request({ email: 'Ana@Grace.org', turnstileToken: 'ok', locale: 'es' }))
    expect(res.status).toBe(200)
    expect(m.generateLink).toHaveBeenCalledWith({ type: 'recovery', email: 'ana@grace.org' })
    expect(m.sent).toEqual([{
      to: 'ana@grace.org', subject: 'Restablece tu contraseña', locale: 'es',
      actionUrl: 'https://lms.example.org/auth/reset?token_hash=abc%2F123',
    }])
    expect(m.events).toContain('reset_requested')
  })

  it('answers the same for an unknown email and sends nothing (not found)', async () => {
    m.profile = { uid: 'u1' }
    const known = await (await POST(request({ email: 'ana@grace.org', turnstileToken: 'ok' }))).json()
    m.profile = null; m.sent = []
    const res = await POST(request({ email: 'nobody@grace.org', turnstileToken: 'ok' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(known)
    expect(m.sent).toHaveLength(0)
  })

  it('validates the email and the bot check (validation failure)', async () => {
    expect((await POST(request({ email: 'nope', turnstileToken: 'ok' }))).status).toBe(400)
    const res = await POST(request({ email: 'ana@grace.org', turnstileToken: 'bad' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('captcha')
  })

  it('past the per-email limit, answers as if sent but sends nothing', async () => {
    m.profile = { uid: 'u1' }
    m.limits.email = false
    const res = await POST(request({ email: 'ana@grace.org', turnstileToken: 'ok' }))
    expect(res.status).toBe(200)
    expect(m.sent).toHaveLength(0)
    expect(m.events).toContain('reset_throttled')
  })

  it('throttles per IP', async () => {
    m.limits.ip = false
    expect((await POST(request({ email: 'ana@grace.org', turnstileToken: 'ok' }))).status).toBe(429)
  })

  it('says so when this site has no email provider', async () => {
    delete process.env.RESEND_API_KEY
    const res = await POST(request({ email: 'ana@grace.org', turnstileToken: 'ok' }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('unavailable')
  })
})
