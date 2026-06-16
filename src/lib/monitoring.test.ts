import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { captureError } from './monitoring'

describe('captureError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an 8-character uppercase string', () => {
    const id = captureError(new Error('test'), {})
    expect(id).toHaveLength(8)
    expect(id).toBe(id.toUpperCase())
  })

  it('calls console.error in development environment', () => {
    vi.stubEnv('NODE_ENV', 'development')
    captureError(new Error('boom'), { context: 'test' })
    expect(console.error).toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('calls console.error in test environment', () => {
    captureError(new Error('test-env error'), { segment: 'unit-test' })
    expect(console.error).toHaveBeenCalled()
  })

  it('does not include error.stack in the return value', () => {
    const err = new Error('stack leak test')
    const id = captureError(err, {})
    expect(id).not.toContain('\n')
    expect(id).not.toContain('Error:')
    expect(id).not.toContain('at ')
  })

  it('returns a different ID on each call', () => {
    const id1 = captureError(new Error('a'), {})
    const id2 = captureError(new Error('b'), {})
    expect(id1).not.toBe(id2)
  })
})
