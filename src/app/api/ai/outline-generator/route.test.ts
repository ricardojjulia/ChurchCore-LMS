// @vitest-environment node
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
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mocks.single,
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  outlineLimiter: null,
  checkLimit: mocks.checkLimit,
}))

import { POST } from './route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/ai/outline-generator', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const fetchMock = vi.fn()

const MOCK_OUTLINE_JSON = {
  course_title: 'TH-401 Consejería Pastoral',
  course_description: 'Módulo de consejería pastoral',
  modules: [
    {
      title: 'Módulo 1: Introducción',
      blocks: [
        { title: 'Lección 1', type: 'text', objective: 'Comprender los fundamentos' },
      ],
    },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  mocks.single.mockResolvedValue({ data: { role: 'teacher' } })
  mocks.checkLimit.mockResolvedValue({ limited: false, retryAfter: 0, limit: 5, remaining: 4 })
  fetchMock.mockResolvedValue(
    Response.json({
      choices: [{ message: { content: JSON.stringify(MOCK_OUTLINE_JSON) } }],
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('POST /api/ai/outline-generator', () => {
  it('rejects unauthenticated requests with 401', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(req({ text: 'Some curriculum' }))
    expect(res.status).toBe(401)
  })

  it('rejects student role with 403', async () => {
    mocks.single.mockResolvedValue({ data: { role: 'student' } })
    const res = await POST(req({ text: 'Some curriculum' }))
    expect(res.status).toBe(403)
  })

  it('returns 503 when no API key is configured', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const res = await POST(req({ text: 'Some curriculum' }))
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toContain('OPENROUTER_API_KEY')
  })

  it('generates outline successfully via OpenRouter for text input', async () => {
    const res = await POST(req({ text: 'TH-401 Pastoral Counseling Syllabus' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.outline).toEqual(MOCK_OUTLINE_JSON)
    expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(fetchMock.mock.calls[0][1].headers['Authorization']).toBe('Bearer test-openrouter-key')
  })

  it('handles markdown code fences returned by the LLM', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: '```json\n' + JSON.stringify(MOCK_OUTLINE_JSON) + '\n```',
            },
          },
        ],
      })
    )
    const res = await POST(req({ text: 'TH-401 Pastoral Counseling Syllabus' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.outline).toEqual(MOCK_OUTLINE_JSON)
  })

  it('returns 429 when user exceeds rate limit', async () => {
    mocks.checkLimit.mockResolvedValue({ limited: true, retryAfter: 60, limit: 5, remaining: 0 })
    const res = await POST(req({ text: 'TH-401' }))
    expect(res.status).toBe(429)
  })
})
