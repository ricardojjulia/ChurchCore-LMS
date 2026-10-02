import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildSanitizedPushPayload,
  enqueuePushNotification,
  drainPushQueue,
  DEFAULT_PUSH_PREFS,
} from '@/lib/push'
import { covers } from '@/tests/covers'

covers(
  'api:POST /api/push/subscribe',
  'api:DELETE /api/push/subscribe',
  'api:GET /api/push/vapid-key',
  'api:GET /api/push/preferences',
  'api:PUT /api/push/preferences',
  'api:POST /api/push/send'
)

// Mock web-push
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

describe('COUNCIL-2026-040 Phase 1: Web Push Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('PII-Safe Payload Sanitization (Amendment 1)', () => {
    it('generates non-PII payloads across all event types', () => {
      const gradePayload = buildSanitizedPushPayload('grade_posted', '/courses/course-1')
      expect(gradePayload.title).toBe('Assignment Graded')
      expect(gradePayload.body).not.toContain('grade')
      expect(gradePayload.body).not.toContain('%')
      expect(gradePayload.deep_link).toBe('/courses/course-1')

      const msgPayload = buildSanitizedPushPayload('new_message', '/messages/thread-1')
      expect(msgPayload.title).toBe('New Message')
      expect(msgPayload.body).toBe('You have received a new message. Tap to open the conversation.')
      expect(msgPayload.body).not.toContain('John')

      const completePayload = buildSanitizedPushPayload('course_completed', '/certificates', {
        courseTitle: 'Theology 101',
      })
      expect(completePayload.title).toBe('Course Completed!')
      expect(completePayload.body).toContain('Theology 101')
    })
  })

  describe('Enqueue Push Notification', () => {
    it('skips enqueueing if user is inactive or not found', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }

      const result = await enqueuePushNotification(mockSupabase as any, {
        orgId: 'org-1',
        userId: 'user-1',
        eventType: 'announcement',
        title: 'Title',
        body: 'Body',
        deepLink: '/announcements',
      })

      expect(result.enqueued).toBe(false)
      expect(result.skippedReason).toBe('user_inactive_or_not_found')
    })

    it('skips enqueueing if user opted out of that event type in preferences', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              is_active: true,
              notification_prefs: { announcement: false },
            },
          }),
        }),
      }

      const result = await enqueuePushNotification(mockSupabase as any, {
        orgId: 'org-1',
        userId: 'user-1',
        eventType: 'announcement',
        title: 'Announcement',
        body: 'New announcement',
        deepLink: '/announcements',
      })

      expect(result.enqueued).toBe(false)
      expect(result.skippedReason).toBe('opted_out_by_user_preferences')
    })

    it('enqueues notification into queue when user opted in', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null })
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  is_active: true,
                  notification_prefs: DEFAULT_PUSH_PREFS,
                },
              }),
            }
          }
          if (table === 'push_notification_queue') {
            return {
              insert: insertMock,
            }
          }
          return {}
        }),
      }

      const result = await enqueuePushNotification(mockSupabase as any, {
        orgId: 'org-1',
        userId: 'user-1',
        eventType: 'grade_posted',
        title: 'Assignment Graded',
        body: 'Your assignment has been graded.',
        deepLink: '/courses',
      })

      expect(result.enqueued).toBe(true)
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'org-1',
          user_id: 'user-1',
          event_type: 'grade_posted',
          title: 'Assignment Graded',
          status: 'pending',
        })
      )
    })
  })

  describe('Drain Push Notification Queue', () => {
    it('dispatches pending notifications and marks queue delivered', async () => {
      const webpush = (await import('web-push')).default
      ;(webpush.sendNotification as any).mockResolvedValue({})

      const updateMock = vi.fn().mockReturnThis()
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'push_notification_queue') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              lte: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'queue-1',
                    user_id: 'user-1',
                    org_id: 'org-1',
                    title: 'New Message',
                    body: 'You received a message.',
                    deep_link: '/messages',
                    attempt_count: 0,
                  },
                ],
                error: null,
              }),
              update: updateMock,
            }
          }
          if (table === 'push_subscriptions') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              mockResolvedValue: vi.fn(),
            }
          }
          return {}
        }),
      }

      // Return active subscriptions for user-1
      const selectSubs = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col: string, val: string) => {
          return {
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'sub-1',
                  endpoint: 'https://push.example.com/endpoint-1',
                  p256dh: 'p256key',
                  auth: 'authkey',
                },
              ],
            }),
          }
        }),
      }

      mockSupabase.from = vi.fn().mockImplementation((table: string) => {
        if (table === 'push_notification_queue') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'queue-1',
                  user_id: 'user-1',
                  org_id: 'org-1',
                  title: 'New Message',
                  body: 'You received a message.',
                  deep_link: '/messages',
                  attempt_count: 0,
                },
              ],
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        if (table === 'push_subscriptions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'sub-1',
                      endpoint: 'https://push.example.com/endpoint-1',
                      p256dh: 'p256key',
                      auth: 'authkey',
                    },
                  ],
                }),
              }),
            }),
          }
        }
        return {}
      })

      const summary = await drainPushQueue(mockSupabase as any, 10)
      expect(summary.processed).toBe(1)
      expect(summary.delivered).toBe(1)
      expect(summary.failed).toBe(0)
    })

    it('prunes dead subscriptions immediately on 410 Gone / 404 Not Found (Amendment 4)', async () => {
      const webpush = (await import('web-push')).default
      ;(webpush.sendNotification as any).mockRejectedValue({
        statusCode: 410,
        message: 'Gone',
      })

      const deleteMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'push_notification_queue') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              lte: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'queue-1',
                    user_id: 'user-1',
                    org_id: 'org-1',
                    title: 'New Message',
                    body: 'You received a message.',
                    deep_link: '/messages',
                    attempt_count: 0,
                  },
                ],
                error: null,
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }
          }
          if (table === 'push_subscriptions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'sub-expired-1',
                        endpoint: 'https://push.example.com/expired',
                        p256dh: 'p256key',
                        auth: 'authkey',
                      },
                    ],
                  }),
                }),
              }),
              delete: deleteMock,
            }
          }
          return {}
        }),
      }

      const summary = await drainPushQueue(mockSupabase as any, 10)
      expect(summary.prunedSubscriptions).toBe(1)
      expect(deleteMock).toHaveBeenCalled()
    })
  })
})
