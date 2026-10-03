// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
  checkLimit: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: (_table: string) => ({
      select: () => ({
        in: () => Promise.resolve({ data: [{ id: 'page-1', title: 'Intro to Grace' }] }),
      }),
      insert: mocks.insert,
    }),
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  tutorLimiter: null,
  checkLimit: mocks.checkLimit,
}))

vi.mock('@/lib/openrouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/openrouter')>()
  return {
    ...actual,
    getOpenRouterApiKey: vi.fn(() => 'sk-or-v1-mock-key'),
    fetchOpenRouterEmbeddings: vi.fn(async () => [[0.01, 0.02, 0.03]]),
  }
})

import { POST } from './route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/ai/tutor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const fetchMock = vi.fn()

describe('POST /api/ai/tutor — OpenRouter RAG AI Tutor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-v1-mock-key')

    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-auth-123' } } })
    mocks.checkLimit.mockResolvedValue({ limited: false, retryAfter: 0, limit: 30, remaining: 29 })
    mocks.insert.mockResolvedValue({ error: null })

    // Mock RPC build_tutor_context
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === 'build_tutor_context') {
        return Promise.resolve({
          data: {
            blueprint_id: 'bp-1',
            blueprint_title: 'Christian Theology 101',
            term_name: 'Fall 2026',
            cohort_name: 'Cohort Alpha',
            program_track_name: 'Pastoral Ministry',
            delivery_format: 'self_paced',
            has_enrollment: true,
            accessWindowOpen: true,
          },
          error: null,
        })
      }
      if (fn === 'search_content_chunks') {
        return Promise.resolve({
          data: [
            {
              page_id: 'page-1',
              chunk_index: 0,
              chunk_text: 'Grace is unmerited divine favor and love bestowed upon humanity.',
              similarity: 0.88,
              section_code: 'SEC-101',
            },
          ],
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"Grace refers to unmerited favor."}}]}\n\n'
          )
        )
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    fetchMock.mockResolvedValue(
      new Response(mockStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST(makeRequest({ sectionId: 'sec-1', query: 'What is grace?' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when body or required fields are missing', async () => {
    const resNoQuery = await POST(makeRequest({ sectionId: 'sec-1' }))
    expect(resNoQuery.status).toBe(400)

    const resNoSec = await POST(makeRequest({ query: 'Hello?' }))
    expect(resNoSec.status).toBe(400)
  })

  it('returns 429 when rate limit exceeded', async () => {
    mocks.checkLimit.mockResolvedValueOnce({ limited: true, retryAfter: 60, limit: 30, remaining: 0 })
    const res = await POST(makeRequest({ sectionId: 'sec-1', query: 'What is grace?' }))
    expect(res.status).toBe(429)
  })

  it('successfully retrieves RAG context, streams SSE events from OpenRouter, and logs query', async () => {
    const res = await POST(makeRequest({ sectionId: 'sec-1', query: 'What is grace?' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/event-stream')

    const text = await res.text()
    expect(text).toContain('"type":"context"')
    expect(text).toContain('"type":"delta"')
    expect(text).toContain('Grace refers to unmerited favor.')
    expect(text).toContain('"type":"done"')

    // Verifies audit logging was called
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-auth-123',
        section_id: 'sec-1',
        chunk_count: 1,
      })
    )
  })
})
