// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generatePageEmbedding } from './embedding'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockSvcFrom = vi.fn()

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    from: mockSvcFrom,
  }),
}))

vi.mock('@/utils/tiptap', () => ({
  tiptapToHtml: () => '<p>The doctrine of grace provides foundational understanding of salvation and reconciliation.</p>',
}))

vi.mock('@/lib/openrouter', () => ({
  getOpenRouterApiKey: vi.fn(() => 'sk-or-mock-key'),
  fetchOpenRouterEmbeddings: vi.fn(async () => [[0.12, 0.34, 0.56]]),
}))

describe('generatePageEmbedding (RAG Vector Indexing)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-teacher-1' } } })
  })

  it('rejects unauthenticated users', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await generatePageEmbedding('page-1')
    expect(res.status).toBe('failed')
    expect(res.error).toBe('Not authenticated')
  })

  it('rejects non-staff roles', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'student' } }),
    })
    const res = await generatePageEmbedding('page-1')
    expect(res.status).toBe('failed')
    expect(res.error).toBe('Forbidden')
  })

  it('processes published page, fetches embeddings, and upserts chunks', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'teacher' } }),
        }
      }
      if (table === 'content_pages') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'page-1',
              title: 'Grace and Redemption',
              status: 'published',
              body: { type: 'doc' },
            },
          }),
        }
      }
      return {}
    })

    const svcUpdates: any[] = []
    const svcUpserts: any[] = []

    mockSvcFrom.mockImplementation((table: string) => {
      return {
        update: (data: any) => {
          svcUpdates.push({ table, data })
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        },
        upsert: (rows: any) => {
          svcUpserts.push({ table, rows })
          return Promise.resolve({ error: null })
        },
      }
    })

    const res = await generatePageEmbedding('page-1')
    expect(res.status).toBe('complete')
    expect(res.chunksIndexed).toBe(1)
    expect(svcUpserts.some((u) => u.table === 'embeddings')).toBe(true)
  })
})
