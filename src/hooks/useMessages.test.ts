import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { mockSupabaseClient } from '@/utils/supabase/__mocks__/client'
import { useMessages } from './useMessages'
import type { Message } from './useMessages'

const TEST_THREAD_ID = 'thread-001'

const SAMPLE_MESSAGE: Message = {
  id: 'msg-001',
  thread_id: TEST_THREAD_ID,
  sender_id: 'user-001',
  body: 'Hello world',
  is_deleted: false,
  created_at: new Date().toISOString(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useMessages', () => {
  it('initializes with empty messages when threadId is null', () => {
    const { result } = renderHook(() => useMessages(null))
    expect(result.current.messages).toEqual([])
  })

  it('loads messages from Supabase on mount for a given threadId', async () => {
    const chainMock = {
      select:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      order:   vi.fn().mockReturnThis(),
      limit:   vi.fn().mockResolvedValue({ data: [SAMPLE_MESSAGE], error: null }),
    }
    mockSupabaseClient.from.mockReturnValue(chainMock)

    const { result } = renderHook(() => useMessages(TEST_THREAD_ID))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].body).toBe('Hello world')
  })

  it('sets loading to false after fetch completes', async () => {
    const chainMock = {
      select:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      order:   vi.fn().mockReturnThis(),
      limit:   vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    mockSupabaseClient.from.mockReturnValue(chainMock)

    const { result } = renderHook(() => useMessages(TEST_THREAD_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('calls supabase.channel() with thread-scoped channel name', () => {
    renderHook(() => useMessages(TEST_THREAD_ID))
    expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
      expect.stringContaining(TEST_THREAD_ID),
    )
  })

  it('calls removeChannel on unmount', () => {
    const fakeChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
    mockSupabaseClient.channel.mockReturnValue(fakeChannel)

    const { unmount } = renderHook(() => useMessages(TEST_THREAD_ID))
    unmount()

    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(fakeChannel)
  })

  it('exposes isAtBottomRef', () => {
    const { result } = renderHook(() => useMessages(TEST_THREAD_ID))
    expect(result.current.isAtBottomRef).toBeDefined()
    expect(result.current.isAtBottomRef.current).toBe(true)
  })
})
