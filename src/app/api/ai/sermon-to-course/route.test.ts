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
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mocks.single,
    }),
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  outlineLimiter: null,
  checkLimit: mocks.checkLimit,
}))

vi.mock('@/lib/openrouter', () => ({
  getOpenRouterApiKey: vi.fn(() => 'sk-mock-key'),
  callOpenRouter: vi.fn(async () => ({
    ok: true,
    status: 200,
    modelUsed: 'google/gemini-2.0-flash-001',
    json: {
      course_title: 'Walking in Grace',
      course_description: 'A 4-week discipleship path through Galatians 5.',
      biblical_passages: ['Galatians 5:1-26'],
      theological_themes: ['Christian Freedom', 'Fruit of the Spirit'],
      target_audience: 'General Congregation',
      small_group_guide: {
        topic: 'Living by the Spirit',
        icebreaker: 'Share a time when you felt truly free.',
        observationQuestions: ['What does Paul say about circumcision in verse 2?'],
        interpretationQuestions: ['How does grace differ from legalism?'],
        applicationQuestions: ['Which fruit of the Spirit do you need God to grow in you this week?'],
        leaderNotes: 'Encourage vulnerability in small group sharing.',
      },
      daily_devotionals: [
        {
          day: 1,
          title: 'Set Free for Freedom',
          scripture: 'Galatians 5:1',
          reflection: 'Christ has set us free from the curse of the law.',
          prayerFocus: 'Pray for freedom from performance-based religion.',
        },
      ],
      modules: [
        {
          title: 'Module 1: The Danger of Legalism',
          blocks: [
            {
              title: 'Lesson 1: Stand Fast',
              type: 'page',
              content: {
                body: '<p>Paul begins with a strong warning against falling back into slavery.</p>',
              },
            },
          ],
        },
      ],
    },
  })),
}))

import { POST } from './route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/ai/sermon-to-course', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/ai/sermon-to-course — Pulpit-to-Pathway Superpower', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-pastor-1' } } })
    mocks.single.mockResolvedValue({ data: { role: 'teacher' } })
    mocks.checkLimit.mockResolvedValue({ limited: false, retryAfter: 0, limit: 10, remaining: 9 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects unauthenticated requests', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST(makeRequest({ sermonText: 'Sample sermon text here...' }))
    expect(res.status).toBe(401)
  })

  it('rejects non-staff students', async () => {
    mocks.single.mockResolvedValueOnce({ data: { role: 'student' } })
    const res = await POST(makeRequest({ sermonText: 'Sample sermon text here...' }))
    expect(res.status).toBe(403)
  })

  it('rejects empty or too short sermon text', async () => {
    const res = await POST(makeRequest({ sermonText: 'Too short' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('at least 50 characters')
  })

  it('successfully transforms sermon manuscript into course with devotionals & leader guide', async () => {
    const res = await POST(
      makeRequest({
        sermonTitle: 'Walking in the Spirit',
        speakerName: 'Pastor David',
        passageReference: 'Galatians 5:16-26',
        sermonText:
          'Today we are looking at what it truly means to walk by the Spirit. In Galatians chapter 5, the apostle Paul shows us the stark contrast between the deeds of the flesh and the supernatural fruit of the Holy Spirit. Love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, and self-control.',
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.course.course_title).toBe('Walking in Grace')
    expect(body.course.small_group_guide).toBeDefined()
    expect(body.course.daily_devotionals).toHaveLength(1)
    expect(body.course.modules).toHaveLength(1)
  })
})
