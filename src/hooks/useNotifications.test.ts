import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { mockSupabaseClient } from '@/utils/supabase/__mocks__/client'
import { useNotifications } from './useNotifications'
import type { Notification } from './useNotifications'

const TEST_USER_ID = 'user-uid-001'

const SAMPLE_NOTIFICATION: Notification = {
  id: 'notif-001',
  user_id: TEST_USER_ID,
  type: 'system',
  title: 'Welcome',
  body: 'Hello!',
  link: null,
  is_read: false,
  created_at: new Date().toISOString(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useNotifications', () => {
  it('initializes with empty notifications and unreadCount 0 when userId is null', () => {
    const { result } = renderHook(() => useNotifications(null))
    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(0)
  })

  it('loads initial notifications from Supabase on mount', async () => {
    const chainMock = {
      select:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      order:   vi.fn().mockReturnThis(),
      limit:   vi.fn().mockResolvedValue({
        data: [SAMPLE_NOTIFICATION],
        error: null,
      }),
    }
    mockSupabaseClient.from.mockReturnValue(chainMock)

    const { result } = renderHook(() => useNotifications(TEST_USER_ID))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.unreadCount).toBe(1)
  })

  it('unreadCount is 0 when all fetched notifications are already read', async () => {
    const readNotif = { ...SAMPLE_NOTIFICATION, is_read: true }
    const chainMock = {
      select:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      order:   vi.fn().mockReturnThis(),
      limit:   vi.fn().mockResolvedValue({ data: [readNotif], error: null }),
    }
    mockSupabaseClient.from.mockReturnValue(chainMock)

    const { result } = renderHook(() => useNotifications(TEST_USER_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.unreadCount).toBe(0)
  })

  it('calls supabase.channel() on mount when userId is provided', () => {
    renderHook(() => useNotifications(TEST_USER_ID))
    expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
      expect.stringContaining(TEST_USER_ID),
    )
  })

  it('calls removeChannel on unmount', () => {
    const fakeChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
    mockSupabaseClient.channel.mockReturnValue(fakeChannel)

    const { unmount } = renderHook(() => useNotifications(TEST_USER_ID))
    unmount()

    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(fakeChannel)
  })

  it('does not subscribe to channel when userId is null', () => {
    renderHook(() => useNotifications(null))
    expect(mockSupabaseClient.channel).not.toHaveBeenCalled()
  })

  it('markAsRead decrements unreadCount by 1', async () => {
    const chainMock = {
      select:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      order:   vi.fn().mockReturnThis(),
      limit:   vi.fn().mockResolvedValue({ data: [SAMPLE_NOTIFICATION], error: null }),
      update:  vi.fn().mockReturnThis(),
    }
    mockSupabaseClient.from.mockReturnValue(chainMock)

    const { result } = renderHook(() => useNotifications(TEST_USER_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.unreadCount).toBe(1)

    await act(async () => {
      await result.current.markAsRead('notif-001')
    })

    expect(result.current.unreadCount).toBe(0)
  })
})
