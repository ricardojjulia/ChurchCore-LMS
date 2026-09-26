// Regression: edits made while a save is in flight must not be lost.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useContentAutoSave } from './useContentAutoSave'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useContentAutoSave', () => {
  it('debounces rapid edits into one save of the latest content', async () => {
    const save = vi.fn(async () => ({}))
    const { result } = renderHook(() => useContentAutoSave(save, 800))
    act(() => { result.current.scheduleSave({ v: 1 }); result.current.scheduleSave({ v: 2 }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenLastCalledWith({ v: 2 })
    expect(result.current.saveState).toBe('saved')
  })

  it('saves edits typed while an earlier save is still in flight', async () => {
    let release!: () => void
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise<object>((r) => { release = () => r({}) }))
      .mockImplementation(async () => ({}))
    const { result } = renderHook(() => useContentAutoSave(save, 800))

    act(() => { result.current.scheduleSave({ v: 'first' }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })   // first save starts, stays pending
    act(() => { result.current.scheduleSave({ v: 'second' }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })   // debounce fires mid-save
    await act(async () => { release(); await vi.runAllTimersAsync() })

    expect(save).toHaveBeenLastCalledWith({ v: 'second' })
    expect(result.current.saveState).toBe('saved')
  })

  it('reports an error and keeps the content pending', async () => {
    const save = vi.fn(async () => ({ error: 'nope' }))
    const { result } = renderHook(() => useContentAutoSave(save, 800))
    act(() => { result.current.scheduleSave({ v: 1 }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(result.current.saveState).toBe('error')
  })
})
