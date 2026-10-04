// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  checkLimit: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  tutorLimiter: null,
  checkLimit: mocks.checkLimit,
}))

vi.mock('@/lib/openrouter', () => ({
  getOpenRouterApiKey: vi.fn(() => 'sk-mock-key'),
  callOpenRouter: vi.fn(async () => ({
    ok: true,
    status: 200,
    modelUsed: 'google/gemini-2.0-flash-001',
    json: {
      originalText: 'El amor de Dios sobrepasa todo entendimiento y nos llama a perdonar a nuestro prójimo.',
      translatedText: 'The love of God surpasses all understanding and calls us to forgive our neighbor.',
      sourceLanguageDetected: 'es',
      targetLanguage: 'en',
      theologicalTermsGlossary: [
        {
          originalTerm: 'prójimo',
          translatedTerm: 'neighbor',
          explanation: 'Biblical term for fellow human in community (Leviticus 19:18, Luke 10:29).',
        },
      ],
    },
  })),
}))

import { POST } from './route'
import { covers } from '@/tests/covers'

covers('api:POST /api/ai/translate-discussion')

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/ai/translate-discussion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/ai/translate-discussion — Pentecost Translation Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-auth-1' } } })
    mocks.checkLimit.mockResolvedValue({ limited: false, retryAfter: 0, limit: 30, remaining: 29 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects unauthenticated requests', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST(makeRequest({ text: 'Hola', targetLanguage: 'en' }))
    expect(res.status).toBe(401)
  })

  it('rejects missing parameters', async () => {
    const res = await POST(makeRequest({ text: 'Hello' }))
    expect(res.status).toBe(400)
  })

  it('translates theological text with glossary and language detection', async () => {
    const res = await POST(
      makeRequest({
        text: 'El amor de Dios sobrepasa todo entendimiento y nos llama a perdonar a nuestro prójimo.',
        targetLanguage: 'en',
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.translatedText).toContain('The love of God surpasses all understanding')
    expect(body.data.sourceLanguageDetected).toBe('es')
    expect(body.data.theologicalTermsGlossary).toHaveLength(1)
  })
})
