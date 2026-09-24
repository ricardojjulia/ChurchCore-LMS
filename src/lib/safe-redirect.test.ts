// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { safeNextPath } from './safe-redirect'

describe('safeNextPath', () => {
  it.each([
    ['/courses/abc', '/courses/abc'],
    ['/reports?tab=grades#top', '/reports?tab=grades#top'],
    ['/', '/'],
  ])('keeps same-origin path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })

  it.each([
    ['@evil.example', 'userinfo trick: https://app@evil.example'],
    ['//evil.example/x', 'protocol-relative'],
    ['/\\evil.example', 'backslash protocol-relative'],
    ['https://evil.example', 'absolute URL'],
    ['javascript:alert(1)', 'script scheme'],
    ['', 'empty'],
  ])('rejects %s (%s)', (input) => {
    expect(safeNextPath(input)).toBe('/dashboard')
  })

  it('uses the provided fallback', () => {
    expect(safeNextPath(null, '/login')).toBe('/login')
  })
})
