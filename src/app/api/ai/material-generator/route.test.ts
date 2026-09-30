// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { covers } from '@/tests/covers'

covers('api:POST /api/ai/material-generator')

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
  return new NextRequest('http://localhost/api/ai/material-generator', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const fetchMock = vi.fn()

const MOCK_MATERIAL_JSON = {
  title: 'Fundamentos de la Consejería Pastoral',
  markdown_body: '## Introducción\n\nLa consejería pastoral se fundamenta en la gracia.\n\n> 2 Corintios 1:3-4\n\n### Principios Prácticos\n\n1. Escucha activa\n2. Empatía bíblica',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  mocks.single.mockResolvedValue({ data: { role: 'teacher' } })
  mocks.checkLimit.mockResolvedValue({ limited: false, retryAfter: 0, limit: 5, remaining: 4 })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('POST /api/ai/material-generator', () => {
  it('returns 401 when not authenticated', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST(req({ prompt: 'Write a guide on prayer' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is a student', async () => {
    mocks.single.mockResolvedValueOnce({ data: { role: 'student' } })
    const res = await POST(req({ prompt: 'Write a guide on prayer' }))
    expect(res.status).toBe(403)
  })

  it('returns 429 when rate limited', async () => {
    mocks.checkLimit.mockResolvedValueOnce({ limited: true, retryAfter: 3600, limit: 5, remaining: 0 })
    const res = await POST(req({ prompt: 'Write a guide on prayer' }))
    expect(res.status).toBe(429)
  })

  it('returns 400 when prompt and file are missing', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('successfully generates formatted material and Tiptap doc', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(MOCK_MATERIAL_JSON) } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const res = await POST(req({ prompt: 'Write a guide on pastoral counseling', courseTitle: 'Consejería Pastoral' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.title).toBe('Fundamentos de la Consejería Pastoral')
    expect(data.tiptapContent).toBeDefined()
    expect(data.tiptapContent.type).toBe('doc')
    expect(data.tiptapContent.content.length).toBeGreaterThan(0)
  })
})
