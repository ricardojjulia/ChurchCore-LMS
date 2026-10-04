// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  single: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mocks.single,
    }),
  }),
}))

vi.mock('@/lib/openrouter', () => ({
  getOpenRouterApiKey: vi.fn(() => 'sk-mock-key'),
  callOpenRouter: vi.fn(async () => ({
    ok: true,
    status: 200,
    modelUsed: 'google/gemini-2.0-flash-001',
    json: {
      overallHealthScore: 88,
      keyTheologicalMilestonesMastered: [
        'Clear comprehension of justification by grace alone.',
        'High engagement in family prayer routines.',
      ],
      activeSpiritualStrugglesOrQuestions: [
        'Struggling with maintaining regular quiet time amidst busy work schedules.',
        'Questions regarding sharing faith with skeptical relatives.',
      ],
      recommendedPastoralSermonTopics: [
        'Spiritual Disciplines in a Fast-Paced Culture',
        'Gentle & Courageous Apologetics in Everyday Life',
      ],
      recommendedCongregationalCareAreas: [
        'Offer a 3-week workshop on personal prayer habits.',
      ],
      cohortEngagementSummary:
        'The cohort shows deep spiritual hunger and high transparency in small group reflections.',
    },
  })),
}))

import { POST } from './route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/ai/spiritual-formation-pulse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/ai/spiritual-formation-pulse — Spiritual Formation Mirror Superpower', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'pastor-auth-1' } } })
    mocks.single.mockResolvedValue({ data: { role: 'teacher' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects unauthenticated requests', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST(makeRequest({ anonymizedReflections: ['Great reflection'] }))
    expect(res.status).toBe(401)
  })

  it('rejects non-staff students', async () => {
    mocks.single.mockResolvedValueOnce({ data: { role: 'student' } })
    const res = await POST(makeRequest({ anonymizedReflections: ['Great reflection'] }))
    expect(res.status).toBe(403)
  })

  it('rejects empty reflections array', async () => {
    const res = await POST(makeRequest({ anonymizedReflections: [] }))
    expect(res.status).toBe(400)
  })

  it('generates pastoral health trends, sermon suggestions, and care areas without student PII', async () => {
    const res = await POST(
      makeRequest({
        cohortId: 'cohort-1',
        anonymizedReflections: [
          'I am learning to pray more consistently in the morning.',
          'Finding it hard to balance work and Bible reading.',
        ],
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.overallHealthScore).toBe(88)
    expect(body.data.recommendedPastoralSermonTopics).toHaveLength(2)
    expect(body.data.recommendedPastoralSermonTopics[0]).toContain('Spiritual Disciplines')
  })
})
