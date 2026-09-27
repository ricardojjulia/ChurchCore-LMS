// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { hashSignupToken, newSignupToken, signupEnabled, validateSignup } from './signup'
import { slugify } from './signup-slug'

const base = {
  churchName: 'Grace Church', slug: 'grace-church', adminName: 'Ana Pérez',
  email: 'ana@grace.org', timezone: 'America/Chicago', locale: 'es',
}

afterEach(() => { delete process.env.SELF_SERVE_SIGNUP_ENABLED })

describe('validateSignup', () => {
  it('accepts a valid signup and normalizes case', () => {
    const r = validateSignup({ ...base, email: 'Ana@Grace.org', slug: 'Grace-Church' })
    expect(r).toEqual({ ok: true, value: { ...base, email: 'ana@grace.org', slug: 'grace-church', locale: 'es' } })
  })

  it.each([
    ['churchName', 'G', 'invalid'],
    ['slug', 'a', 'invalid'],
    ['slug', '-grace', 'invalid'],
    ['slug', 'grace church', 'invalid'],
    ['slug', 'admin', 'reserved'],
    ['adminName', '', 'invalid'],
    ['email', 'ana@', 'invalid'],
    ['email', 'ana@mailinator.com', 'disposable'],
    ['timezone', 'Mars/Base', 'invalid'],
  ])('rejects %s=%s as %s', (field, value, code) => {
    expect(validateSignup({ ...base, [field]: value })).toEqual({ ok: false, field, code })
  })

  it('defaults an unknown locale to English', () => {
    const r = validateSignup({ ...base, locale: 'fr' })
    expect(r.ok && r.value.locale).toBe('en')
  })
})

describe('slugify', () => {
  it('builds a web-safe slug from a church name', () => {
    expect(slugify('Iglesia Bautista Río Grande!')).toBe('iglesia-bautista-rio-grande')
    expect(slugify('  St. Mark’s  ')).toBe('st-mark-s')
  })
})

describe('signup tokens', () => {
  it('stores only a hash of a high-entropy token', () => {
    const { token, hash } = newSignupToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hash).toBe(hashSignupToken(token))
    expect(hash).not.toContain(token)
  })
})

describe('signupEnabled', () => {
  it('is off unless explicitly enabled', () => {
    expect(signupEnabled()).toBe(false)
    process.env.SELF_SERVE_SIGNUP_ENABLED = 'true'
    expect(signupEnabled()).toBe(true)
  })
})
