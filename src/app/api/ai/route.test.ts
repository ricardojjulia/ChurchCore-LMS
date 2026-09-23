// @vitest-environment node
/**
 * /api/ai — Anthropic passthrough for HQ. Regression tests for the open-proxy
 * fix: the route used to forward any body, unauthenticated, with the server's
 * API key. Covers: 401 anonymous, 403 non-staff, 400 invalid/disallowed body,
 * 429 rate limit, 503 unconfigured, forwarded body is allowlisted and capped,
 * upstream errors are not echoed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  single: vi.fn(),
  checkLimit: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  tutorLimiter: null,
  checkLimit: mocks.checkLimit,
}))

import { POST } from './route'

const VALID = {
  model: 'claude-sonnet-4-6',
  max_tokens: 16000,
  stream: false,
  system: 'You are the architect.',
  messages: [{ role: 'user', content: 'Hello' }],
}

function req(body: unknown) {
  return new NextRequest('http://localhost/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  mocks.single.mockResolvedValue({ data: { role: 'teacher' } })
  mocks.checkLimit.mockResolvedValue({ limited: false, retryAfter: 0, limit: 20, remaining: 19 })
  fetchMock.mockResolvedValue(Response.json({ id: 'msg_1', content: [] }, { status: 200 }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('POST /api/ai', () => {
  it('rejects anonymous callers with 401 and never calls Anthropic', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(req(VALID))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['student', 'guardian'])('rejects the %s role with 403', async (role) => {
    mocks.single.mockResolvedValue({ data: { role } })
    const res = await POST(req(VALID))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['non-JSON body', 'not json'],
    ['disallowed model', { ...VALID, model: 'claude-opus-anything' }],
    ['missing messages', { ...VALID, messages: [] }],
    ['bad message role', { ...VALID, messages: [{ role: 'system', content: 'x' }] }],
    ['non-string system', { ...VALID, system: { evil: true } }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await POST(req(body))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 429 when the per-user limit is exceeded', async () => {
    mocks.checkLimit.mockResolvedValue({ limited: true, retryAfter: 30, limit: 20, remaining: 0 })
    const res = await POST(req(VALID))
    expect(res.status).toBe(429)
    expect(mocks.checkLimit).toHaveBeenCalledWith(null, 'hq:auth-1')
  })

  it('returns 503 when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const res = await POST(req(VALID))
    expect(res.status).toBe(503)
  })

  it('forwards only allowlisted fields and caps max_tokens', async () => {
    const res = await POST(req({ ...VALID, max_tokens: 999_999, temperature: 2, tools: [{ name: 'x' }], metadata: { a: 1 } }))
    expect(res.status).toBe(200)
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent).toEqual({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      stream: false,
      system: 'You are the architect.',
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('does not echo upstream error bodies', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: 'internal detail: org quota' } }, { status: 529 }))
    const res = await POST(req(VALID))
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('internal detail')
  })
})
