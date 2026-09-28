import { describe, expect, it } from 'vitest'
import { checkPassword, linkSessionIsFresh, LINK_GRACE_SECONDS } from './password-policy'

describe('checkPassword', () => {
  it('accepts a reasonable password', () => {
    expect(checkPassword('correct horse battery', 'ana@grace.org')).toBeNull()
  })
  it('rejects short, over-long, email-like and common passwords', () => {
    expect(checkPassword('short1')).toBe('too_short')
    expect(checkPassword('x'.repeat(73))).toBe('too_long')
    // 72 bytes is the bcrypt limit, counted in bytes not characters.
    expect(checkPassword('é'.repeat(37))).toBe('too_long')
    expect(checkPassword('Ana@Grace.org', 'ana@grace.org')).toBe('matches_email')
    expect(checkPassword('ana.lopez', 'Ana.Lopez@grace.org')).toBe('matches_email')
    expect(checkPassword('Password123')).toBe('too_common')
    expect(checkPassword('JesusSaves')).toBe('too_common')
  })
})

describe('linkSessionIsFresh', () => {
  const now = 1_800_000_000
  it('is true only for a recent recovery or one-time-link sign-in', () => {
    expect(linkSessionIsFresh([{ method: 'recovery', timestamp: now - 60 }], now)).toBe(true)
    expect(linkSessionIsFresh([{ method: 'otp', timestamp: now - LINK_GRACE_SECONDS }], now)).toBe(true)
    expect(linkSessionIsFresh([{ method: 'otp', timestamp: now - LINK_GRACE_SECONDS - 1 }], now)).toBe(false)
    expect(linkSessionIsFresh([{ method: 'password', timestamp: now }], now)).toBe(false)
    expect(linkSessionIsFresh([{ method: 'recovery' }], now)).toBe(false)
    expect(linkSessionIsFresh(null, now)).toBe(false)
  })
})
