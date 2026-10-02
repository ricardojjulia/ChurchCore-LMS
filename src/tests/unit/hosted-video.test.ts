import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createDirectUploadUrl,
  generateSignedPlaybackToken,
  recordVideoHeartbeat,
} from '@/lib/video'
import {
  requestVideoUploadUrl,
  getVideoPlaybackInfo,
  sendVideoHeartbeat,
} from '@/app/actions/video'
import { POST as handleUploadUrl } from '@/app/api/video/upload-url/route'
import { GET as handlePlaybackToken } from '@/app/api/video/[id]/playback-token/route'
import { POST as handleWebhook } from '@/app/api/video/webhook/route'
import { covers } from '@/tests/covers'
import { NextRequest } from 'next/server'

covers(
  'api:POST /api/video/upload-url',
  'api:GET /api/video/[id]/playback-token',
  'api:POST /api/video/webhook',
  'action:video.requestVideoUploadUrl',
  'action:video.getVideoPlaybackInfo',
  'action:video.sendVideoHeartbeat'
)

// Mock supabase
const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockSvcFrom = vi.fn()

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}))

vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: mockSvcFrom,
  })),
}))

describe('COUNCIL-2026-041: Hosted Video Streaming & Must-View Heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Provider & Token Generation (provider.ts)', () => {
    it('generates direct upload URL and asset IDs', async () => {
      const res = await createDirectUploadUrl({
        orgId: 'org-test',
        title: 'Sermon on the Mount Analysis',
      })

      expect(res.uploadUrl).toBeDefined()
      expect(res.uploadId).toBeDefined()
      expect(res.assetId).toBeDefined()
    })

    it('generates signed playback token with valid JWT structure', () => {
      const tokenResult = generateSignedPlaybackToken({
        playbackId: 'mux_playback_123',
        viewerUid: 'user-viewer-456',
        expiresInSeconds: 7200,
      })

      expect(tokenResult.token).toBeDefined()
      expect(tokenResult.hlsUrl).toContain('mux_playback_123.m3u8?token=')
      expect(tokenResult.thumbnailUrl).toContain('mux_playback_123/thumbnail.jpg?token=')

      // Validate JWT parts
      const parts = tokenResult.token.split('.')
      expect(parts.length).toBe(3)
    })
  })

  describe('Watch Heartbeat & Must-View Tracking (heartbeat.ts)', () => {
    it('records watch progress and marks incomplete when under 85%', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }),
      }

      const result = await recordVideoHeartbeat(mockSupabase as any, {
        videoAssetId: 'v-101',
        blockId: 'b-202',
        userUid: 'u-1',
        orgId: 'org-1',
        currentSeconds: 40,
        maxPosition: 40,
        duration: 100,
      })

      expect(result.success).toBe(true)
      expect(result.progressPercent).toBe(40)
      expect(result.completed).toBe(false)
    })

    it('marks completed when watched >= 85% for reliable must_view requirement', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }),
      }

      const result = await recordVideoHeartbeat(mockSupabase as any, {
        videoAssetId: 'v-101',
        blockId: 'b-202',
        userUid: 'u-1',
        orgId: 'org-1',
        currentSeconds: 90,
        maxPosition: 90,
        duration: 100,
      })

      expect(result.success).toBe(true)
      expect(result.progressPercent).toBe(90)
      expect(result.completed).toBe(true)
    })
  })

  describe('Server Actions (video.ts)', () => {
    it('requestVideoUploadUrl checks teacher/admin role and creates video record', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-teacher' } } })
      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { uid: 'u-t', org_id: 'org-1', role: 'teacher' } }),
          }
        }
        if (table === 'video_assets') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'va-created-1' }, error: null }),
              }),
            }),
          }
        }
        return {}
      })

      const res = await requestVideoUploadUrl({ title: 'Hermeneutics Lecture 1' })
      expect(res.success).toBe(true)
      expect(res.assetId).toBe('va-created-1')
      expect(res.uploadUrl).toBeDefined()
    })

    it('getVideoPlaybackInfo returns signed token for member in org', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-student' } } })
      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { uid: 'u-stu', org_id: 'org-1' } }),
          }
        }
        if (table === 'video_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'va-1',
                provider_playback_id: 'pb-99',
                duration_seconds: 300,
                title: 'Introduction',
                captions: [],
              },
              error: null,
            }),
          }
        }
        return {}
      })

      const res = await getVideoPlaybackInfo({ assetId: 'va-1' })
      expect(res.success).toBe(true)
      expect(res.playback?.hlsUrl).toContain('pb-99.m3u8')
      expect(res.playback?.durationSeconds).toBe(300)
    })

    it('sendVideoHeartbeat records user progress', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-student' } } })
      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { uid: 'u-stu', org_id: 'org-1' } }),
          }
        }
        if (table === 'video_playback_heartbeats') {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        return {}
      })

      const res = await sendVideoHeartbeat({
        videoAssetId: 'va-1',
        blockId: 'b-1',
        currentSeconds: 95,
        maxPosition: 95,
        duration: 100,
      })

      expect(res.success).toBe(true)
      expect(res.completed).toBe(true)
    })
  })

  describe('API Routes', () => {
    it('POST /api/video/upload-url handles upload URL creation', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-adm' } } })
      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1', role: 'admin' } }),
          }
        }
        if (table === 'video_assets') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'va-api-1' }, error: null }),
              }),
            }),
          }
        }
        return {}
      })

      const req = new NextRequest('http://localhost:3000/api/video/upload-url', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Video' }),
      })

      const res = await handleUploadUrl(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.assetId).toBe('va-api-1')
    })

    it('GET /api/video/[id]/playback-token returns signed token', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-adm' } } })
      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { uid: 'u-1', org_id: 'org-1' } }),
          }
        }
        if (table === 'video_assets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'va-token-1',
                provider_playback_id: 'pb-123',
                duration_seconds: 60,
                title: 'Test',
              },
              error: null,
            }),
          }
        }
        return {}
      })

      const req = new NextRequest('http://localhost:3000/api/video/va-token-1/playback-token')
      const res = await handlePlaybackToken(req, { params: Promise.resolve({ id: 'va-token-1' }) })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.hlsUrl).toContain('pb-123.m3u8')
    })

    it('POST /api/video/webhook updates asset status to ready', async () => {
      mockSvcFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })

      const req = new NextRequest('http://localhost:3000/api/video/webhook', {
        method: 'POST',
        body: JSON.stringify({
          type: 'video.asset.ready',
          data: {
            id: 'asset_mux_999',
            upload_id: 'upload_mux_888',
            playback_ids: [{ id: 'pb_mux_777' }],
            duration: 120.5,
            aspect_ratio: '16:9',
          },
        }),
      })

      const res = await handleWebhook(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.received).toBe(true)
    })
  })
})
