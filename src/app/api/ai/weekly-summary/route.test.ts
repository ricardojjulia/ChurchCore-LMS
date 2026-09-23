// @vitest-environment node
/**
 * /api/ai/weekly-summary — calls Anthropic directly (it used to loop back
 * through /api/ai, which stopped working once /api/ai required a staff session).
 * Covers: 401, 429, no-enrollment short-circuit, 503 unconfigured, 502 on
 * network error and on upstream error, happy path, and that it never calls
 * the /api/ai loopback.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  checkLimit: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}))
vi.mock('@/lib/rate-limit', () => ({ heavyLimiter: null, checkLimit: mocks.checkLimit }))

import { GET } from './route'

const ROW = {
  course_title: 'Intro', enrollment_status: 'in_progress', progress_percent: 40,
  average_grade: 88, letter_grade: 'B+', gpa_points: 3.3,
  total_submissions: 3, graded_submissions: 2, is_at_risk: false,
}
const fetchMock = vi.fn()
const req = () => new NextRequest('http://localhost/api/ai/weekly-summary')

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  mocks.checkLimit.mockResolvedValue({ limited: false, retryAfter: 0, limit: 5, remaining: 4 })
  mocks.rpc.mockImplementation(async (fn: string) =>
    fn === 'get_my_academic_performance' ? { data: [ROW] } : { data: 3.3 })
  fetchMock.mockResolvedValue(Response.json({ content: [{ type: 'text', text: 'Great week!' }] }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('GET /api/ai/weekly-summary', () => {
  it('401 without a session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect((await GET(req())).status).toBe(401)
  })

  it('429 when rate limited', async () => {
    mocks.checkLimit.mockResolvedValue({ limited: true, retryAfter: 10, limit: 5, remaining: 0 })
    expect((await GET(req())).status).toBe(429)
  })

  it('short-circuits without an AI call when the student has no courses', async () => {
    mocks.rpc.mockResolvedValue({ data: [] })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('503 when AI is not configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect((await GET(req())).status).toBe(503)
  })

  it('502 (not an unhandled 500) when the provider is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    expect((await GET(req())).status).toBe(502)
  })

  it('502 on an upstream error', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'x' }, { status: 529 }))
    expect((await GET(req())).status).toBe(502)
  })

  it('502 when the provider returns a non-JSON body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>edge error</html>', { status: 200 }))
    expect((await GET(req())).status).toBe(502)
  })

  it('returns the summary, calling Anthropic directly rather than the /api/ai loopback', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ summary: 'Great week!' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages')
    expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe('test-key')
  })
})
