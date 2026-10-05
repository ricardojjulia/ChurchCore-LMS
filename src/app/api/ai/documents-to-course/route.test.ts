// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import JSZip from 'jszip'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  single: vi.fn(),
  checkLimit: vi.fn(),
  apiKey: 'sk-mock-key',
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
  getOpenRouterApiKey: vi.fn(() => mocks.apiKey),
  callOpenRouter: vi.fn(async () => ({
    ok: true,
    status: 200,
    text: JSON.stringify({
      course_title: 'Foundations of Christian Leadership',
      course_description: 'A multi-week synthesis course combining leadership slides and lecture notes.',
      theological_framework: 'Evangelical / Ecumenical',
      learning_outcomes: [
        'Understand servant leadership in the New Testament',
        'Implement practical small-group discipleship systems',
      ],
      target_audience: 'Ministry Directors & Elders',
      source_attribution: ['Leadership_Deck.pptx', 'Sermon_Notes.docx'],
      modules: [
        {
          module_number: 1,
          title: 'Biblical Foundations of Servant Leadership',
          description: 'Exploring Mark 10:42-45 and the servanthood model of Jesus Christ.',
          lessons: [
            {
              lesson_number: 1,
              title: 'The Great Inversion',
              estimated_minutes: 25,
              scripture_references: ['Mark 10:42-45', 'Philippians 2:5-11'],
              blocks: [
                {
                  type: 'page',
                  title: 'Core Principles of the Inverted Kingdom',
                  objective: 'Identify key differences between worldly authority and Christlike humility.',
                  content: {
                    body: '<p>Jesus redefined greatness not by how many serve you, but how many you serve.</p>',
                  },
                },
                {
                  type: 'quiz',
                  title: 'Check Your Understanding',
                  objective: 'Test retention on servant leadership principles.',
                  content: {
                    questions: [
                      {
                        id: 'q1',
                        text: 'According to Mark 10:45, why did the Son of Man come?',
                        type: 'multiple_choice',
                        options: ['To be served', 'To serve and give His life as a ransom', 'To conquer Rome', 'To write laws'],
                        correct_index: 1,
                        points: 10,
                        explanation: 'Jesus explicitly states His purpose was sacrificial service.',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    }),
  })),
}))

import { POST } from './route'
import { covers } from '@/tests/covers'

covers('api:POST /api/ai/documents-to-course')

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/ai/documents-to-course', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/ai/documents-to-course — Multi-Document Course Synthesizer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.apiKey = 'sk-mock-key'
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-teacher-1' } } })
    mocks.single.mockResolvedValue({ data: { role: 'teacher' } })
    mocks.checkLimit.mockResolvedValue({ limited: false, retryAfter: 0, limit: 5, remaining: 4 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects unauthenticated requests with 401', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST(makeRequest({ rawDocuments: [{ name: 'notes.txt', text: 'Some notes' }] }))
    expect(res.status).toBe(401)
  })

  it('rejects non-staff students with 403', async () => {
    mocks.single.mockResolvedValueOnce({ data: { role: 'student' } })
    const res = await POST(makeRequest({ rawDocuments: [{ name: 'notes.txt', text: 'Some notes' }] }))
    expect(res.status).toBe(403)
  })

  it('rejects requests with no files or documents with 400', async () => {
    const res = await POST(makeRequest({ files: [], rawDocuments: [] }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('at least one document')
  })

  it('synthesizes multi-document packages (.pptx and .docx) into a full course', async () => {
    // Generate valid mock PPTX and DOCX base64
    const pptxZip = new JSZip()
    pptxZip.file('ppt/slides/slide1.xml', '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>Slide 1: Vision</a:t></a:r></a:p></p:sld>')
    const pptxBase64 = await pptxZip.generateAsync({ type: 'base64' })

    const docxZip = new JSZip()
    docxZip.file('word/document.xml', '<w:p><w:t>Detailed theological exposition on Mark 10.</w:t></w:p>')
    const docxBase64 = await docxZip.generateAsync({ type: 'base64' })

    const res = await POST(
      makeRequest({
        files: [
          { name: 'Leadership_Vision.pptx', base64: pptxBase64 },
          { name: 'Exposition.docx', base64: docxBase64 },
        ],
        rawDocuments: [
          { name: 'ReadingList.txt', text: 'Required Reading: Discipleship Handbook by Dietrich Bonhoeffer' },
        ],
        courseTitleHint: 'Foundations of Christian Leadership',
        theologicalTradition: 'Evangelical / Ecumenical',
        targetAudience: 'Ministry Directors & Elders',
        pacingWeeks: 4,
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.course).toBeDefined()
    expect(data.course.course_title).toBe('Foundations of Christian Leadership')
    expect(data.course.modules).toHaveLength(1)
    expect(data.course.modules[0].lessons[0].blocks).toHaveLength(2)
    expect(data.sourceDocuments).toHaveLength(3)
  })
})
