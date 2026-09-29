import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFocusMode } from './useFocusMode'

describe('useFocusMode (COUNCIL-2026-013)', () => {
  beforeEach(() => {
    localStorage.clear()
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
    expect(localStorage.getItem('churchcore_focus_mode')).toBe('true')

    act(() => {
      result.current[1]()
    })

    expect(result.current[0]).toBe(false)
    expect(localStorage.getItem('churchcore_focus_mode')).toBe('false')
  })
})
