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
      passage: 'Romans 8:28-30',
      socraticQuestions: [
        'Who is the grammatical subject taking action in verse 28?',
        'How does Paul define those who love God in the context of the golden chain?',
      ],
      contextualClues: [
        'Written in the context of present suffering and future glory.',
      ],
      languageAnalysis: [
        {
          word: 'works together',
          original: 'συνεργεῖ',
          transliteration: 'synergei',
          strongsNumber: 'G4903',
          morphology: 'Present Active Indicative 3rd Person Singular',
          theologicalSignificance: 'God actively orchestrates all circumstances towards ultimate redemption.',
        },
      ],
      theologicalPerspectives: [
        {
          tradition: 'Reformed',
          historicTheologian: 'John Calvin',
          summary: 'Emphasizes sovereign monergistic decree in the golden chain of salvation.',
          keyEmphasis: 'Unconditional divine initiative and preservation.',
        },
        {
          tradition: 'Arminian',
          historicTheologian: 'John Wesley',
          summary: 'Emphasizes God working together with those who respond to prevenient grace.',
          keyEmphasis: 'Universal love and human relational response in faith.',
        },
      ],
      hermeneuticalExercise: {
        instruction: 'Compare verse 28 with Genesis 50:20.',
        prompt: 'How does Joseph’s perspective in Egypt mirror Paul’s theology of divine providence?',
      },
    },
  })),
}))

import { POST } from './route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/ai/socratic-exegesis', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/ai/socratic-exegesis — Socratic Biblical Exegesis Superpower', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'student-auth-1' } } })
    mocks.checkLimit.mockResolvedValue({ limited: false, retryAfter: 0, limit: 30, remaining: 29 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects unauthenticated requests', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST(makeRequest({ passage: 'John 1:1', studentQuestionOrReflection: 'What is the Word?' }))
    expect(res.status).toBe(401)
  })

  it('rejects missing parameters', async () => {
    const res = await POST(makeRequest({ passage: 'Romans 8' }))
    expect(res.status).toBe(400)
  })

  it('returns structured Socratic questions, language analysis, and comparative traditions', async () => {
    const res = await POST(
      makeRequest({
        passage: 'Romans 8:28-30',
        studentQuestionOrReflection: 'Does God cause bad things to happen to believers?',
        preferredTradition: 'ecumenical',
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.socraticQuestions).toHaveLength(2)
    expect(body.data.languageAnalysis[0].transliteration).toBe('synergei')
    expect(body.data.theologicalPerspectives).toHaveLength(2)
    expect(body.data.theologicalPerspectives[0].historicTheologian).toBe('John Calvin')
  })
})
