import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { mockSupabaseClient } from '@/utils/supabase/__mocks__/client'
import { useRealtimeChannel } from './useRealtimeChannel'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRealtimeChannel', () => {
  const defaultOptions = {
    channelName: 'test-channel',
    table: 'notifications',
    onData: vi.fn(),
  }

  it('subscribes to the channel on mount', () => {
    renderHook(() => useRealtimeChannel(defaultOptions))
    expect(mockSupabaseClient.channel).toHaveBeenCalledWith('test-channel')
  })

  it('calls .subscribe() after .on()', () => {
    const channelMock = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
    mockSupabaseClient.channel.mockReturnValue(channelMock)

    renderHook(() => useRealtimeChannel(defaultOptions))

    expect(channelMock.on).toHaveBeenCalled()
    expect(channelMock.subscribe).toHaveBeenCalled()
  })

  it('calls removeChannel on unmount', () => {
    const channelMock = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
    mockSupabaseClient.channel.mockReturnValue(channelMock)

    const { unmount } = renderHook(() => useRealtimeChannel(defaultOptions))
    unmount()

    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(channelMock)
  })

  it('skips subscription when enabled is false', () => {
    renderHook(() => useRealtimeChannel({ ...defaultOptions, enabled: false }))
    expect(mockSupabaseClient.channel).not.toHaveBeenCalled()
  })

  it('passes the filter to .on() when provided', () => {
    const channelMock = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
    mockSupabaseClient.channel.mockReturnValue(channelMock)

    renderHook(() =>
      useRealtimeChannel({
        ...defaultOptions,
        filter: 'user_id=eq.abc',
      }),
    )

    expect(channelMock.on).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ filter: 'user_id=eq.abc' }),
      expect.any(Function),
    )
  })
})
