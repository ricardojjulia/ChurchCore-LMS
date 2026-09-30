import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFocusMode } from './useFocusMode'

describe('useFocusMode (COUNCIL-2026-013)', () => {
  let store: Record<string, string> = {}

  beforeEach(() => {
    store = {}
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { store = {} },
    }
    vi.stubGlobal('localStorage', mockStorage)
  })

  it('defaults to false when localStorage is empty', () => {
    const { result } = renderHook(() => useFocusMode())
    expect(result.current[0]).toBe(false)
  })

  it('toggles focus mode and persists to localStorage', () => {
    const { result } = renderHook(() => useFocusMode())
    expect(result.current[0]).toBe(false)

    act(() => {
      result.current[1]()
    })

    expect(result.current[0]).toBe(true)
    expect(store['churchcore_focus_mode']).toBe('true')

    act(() => {
      result.current[1]()
    })

    expect(result.current[0]).toBe(false)
    expect(store['churchcore_focus_mode']).toBe('false')
  })
})
