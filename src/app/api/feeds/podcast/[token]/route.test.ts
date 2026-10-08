// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { generatePodcastToken } from '@/lib/podcast/feed-auth'
import { GET } from './route'
import { covers } from '@/tests/covers'

covers('api:GET /api/feeds/podcast/[token]')

const mockFrom = vi.fn()

vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    from: mockFrom,
  }),
}))

function makeRequest(token: string) {
  return new NextRequest(`http://localhost:3000/api/feeds/podcast/${token}`, {
    method: 'GET',
  })
}

describe('GET /api/feeds/podcast/[token] — Private Discipleship Podcast Feed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects invalid or tampered tokens with 401', async () => {
    const req = makeRequest('invalid-token-here')
    const res = await GET(req, { params: Promise.resolve({ token: 'invalid-token-here' }) })
    expect(res.status).toBe(401)
    const text = await res.text()
    expect(text).toContain('Invalid or expired podcast feed token')
  })

  it('rejects inactive enrollments with 403', async () => {
    const validToken = generatePodcastToken({
      enrollmentId: 'enroll-inactive',
      userId: 'user-1',
      courseId: 'course-1',
      orgId: 'org-1',
    })

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'enroll-inactive', status: 'dropped', courses: null },
        error: null,
      }),
    })

    const req = makeRequest(validToken)
    const res = await GET(req, { params: Promise.resolve({ token: validToken }) })
    expect(res.status).toBe(403)
  })

  it('generates a full Apple Podcasts compliant RSS feed for active enrollment', async () => {
    const validToken = generatePodcastToken({
      enrollmentId: 'enroll-active-1',
      userId: 'user-pastor',
      courseId: 'course-55',
      orgId: 'org-1',
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'enrollments') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'enroll-active-1',
              status: 'active',
              courses: {
                id: 'course-55',
                title: 'Pastoral Epistles Masterclass',
                description: 'Comprehensive exposition of 1 & 2 Timothy and Titus.',
                image_url: 'https://cdn.churchcore.org/covers/pastoral.jpg',
                organization_id: 'org-1',
                organizations: { name: 'Bethany Theological Seminary' },
              },
            },
            error: null,
          }),
        }
      }

      if (table === 'blocks') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'b-audio-1',
                title: 'Lesson 1: Guarding the Deposit',
                type: 'audio',
                content: {
                  audio_url: 'https://cdn.churchcore.org/audio/timothy-lesson-1.mp3',
                  duration_seconds: 1540,
                  summary: '1 Timothy 1 & 2 overview on doctrine and prayer.',
                  body: '<p>Study notes for 1 Timothy 1.</p>',
                },
                sequence: 1,
                updated_at: '2026-10-01T10:00:00Z',
              },
            ],
            error: null,
          }),
        }
      }

      return {}
    })

    const req = makeRequest(validToken)
    const res = await GET(req, { params: Promise.resolve({ token: validToken }) })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/rss+xml')

    const xml = await res.text()
    expect(xml).toContain('<title>Pastoral Epistles Masterclass — Audio Discipleship</title>')
    expect(xml).toContain('<itunes:author>Bethany Theological Seminary</itunes:author>')
    expect(xml).toContain('<enclosure url="https://cdn.churchcore.org/audio/timothy-lesson-1.mp3"')
    expect(xml).toContain('churchcore-ep-b-audio-1')
  })
})
