// @vitest-environment node
// The success branches of POST /api/signup, which the browser/API suite can't
// reach without an email provider (COUNCIL-2026-034).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { covers } from '../../../tests/covers'

covers('api:POST /api/signup')

const m = vi.hoisted(() => ({
  existingUser: false,
  takenSlug: false,
  inserted: [] as Array<Record<string, unknown>>,
  deleted: [] as string[],
  sent: [] as Array<{ to: string; variant: string; actionUrl: string }>,
  sendFails: false,
}))

vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: async (t: string | null) => t === 'ok' }))
vi.mock('@/lib/rate-limit', () => ({
  checkLimit: async () => ({ limited: false, retryAfter: 0, limit: 0, remaining: 1 }),
  signupIpLimiter: null,
  signupDomainLimiter: null,
}))
vi.mock('@/lib/email', () => ({
  sendEmail: async ({ to, react }: { to: string; react: { props: { variant: string; actionUrl: string } } }) => {
    if (m.sendFails) throw new Error('down')
    m.sent.push({ to, variant: react.props.variant, actionUrl: react.props.actionUrl })
  },
}))
vi.mock('@/emails/SignupVerifyEmail', () => ({ default: (props: unknown) => ({ props }) }))
vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const k of ['select', 'ilike', 'is', 'gt', 'limit', 'eq']) q[k] = () => q
      q.maybeSingle = async () => ({
        data: table === 'organizations' ? (m.takenSlug ? { id: 'o' } : null)
          : table === 'profiles' ? (m.existingUser ? { uid: 'u' } : null)
          : null,
      })
      q.insert = async (row: Record<string, unknown>) => { m.inserted.push(row); return { error: null } }
      q.delete = () => ({ eq: async (_c: string, v: string) => { m.deleted.push(v); return { error: null } } })
      return q
    },
  }),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'

const body = (over: Record<string, unknown> = {}) => ({
  churchName: 'Grace Church', slug: 'grace-church', adminName: 'Ana', email: 'ana@grace.org',
  timezone: 'America/Chicago', locale: 'en', turnstileToken: 'ok', ...over,
})
const request = (data: unknown) =>
  new NextRequest('http://localhost/api/signup', { method: 'POST', body: JSON.stringify(data), headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  process.env.SELF_SERVE_SIGNUP_ENABLED = 'true'
  process.env.APP_BASE_URL = 'https://lms.example.org'
  Object.assign(m, { existingUser: false, takenSlug: false, inserted: [], deleted: [], sent: [], sendFails: false })
})

describe('POST /api/signup', () => {
  it('is hidden while the feature flag is off', async () => {
    delete process.env.SELF_SERVE_SIGNUP_ENABLED
    expect((await POST(request(body()))).status).toBe(404)
  })

  it('stages a pending signup (token hash only) and emails a verification link', async () => {
    const res = await POST(request(body()))
    expect(res.status).toBe(202)
    expect(m.inserted).toHaveLength(1)
    const row = m.inserted[0]
    expect(row).toMatchObject({ email: 'ana@grace.org', slug: 'grace-church' })
    expect(String(row.token_hash)).toMatch(/^[a-f0-9]{64}$/)
    expect(m.sent).toEqual([{ to: 'ana@grace.org', variant: 'verify', actionUrl: expect.stringMatching(/\/api\/signup\/verify\?token=[A-Za-z0-9_-]{43}$/) }])
    expect(m.sent[0].actionUrl).not.toContain(String(row.token_hash))
  })

  it('an existing account gets a sign-in email and the identical response, with nothing staged', async () => {
    m.existingUser = true
    const res = await POST(request(body()))
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ ok: true })
    expect(m.inserted).toHaveLength(0)
    expect(m.sent[0]).toMatchObject({ variant: 'existing', actionUrl: 'https://lms.example.org/login' })
  })

  it('removes the staged signup when the email cannot be sent', async () => {
    m.sendFails = true
    const res = await POST(request(body()))
    expect(res.status).toBe(503)
    expect(m.deleted).toEqual([m.inserted[0].token_hash])
  })

  it('builds email links from configuration, never from the Host header', async () => {
    const spoofed = new NextRequest('https://attacker.example/api/signup', {
      method: 'POST', body: JSON.stringify(body()), headers: { 'content-type': 'application/json', host: 'attacker.example' },
    })
    expect((await POST(spoofed)).status).toBe(202)
    expect(m.sent[0].actionUrl.startsWith('https://lms.example.org/api/signup/verify?token=')).toBe(true)
  })

  it('refuses to send links when no site URL is configured', async () => {
    delete process.env.APP_BASE_URL
    expect((await POST(request(body()))).status).toBe(503)
    expect(m.sent).toHaveLength(0)
  })

  it('refuses a failed security check and a taken slug', async () => {
    expect((await POST(request(body({ turnstileToken: 'bad' })))).status).toBe(400)
    m.takenSlug = true
    expect((await POST(request(body()))).status).toBe(409)
  })
})
