// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { checkAuthPolicy, parseDomains, readAuthPolicy, signInMethods } from './auth-policy'

const open = readAuthPolicy(null)
const staff = (methods: string[], email: string | null = 'pastor@grace.org') => ({ role: 'teacher', email, methods })

describe('readAuthPolicy', () => {
  it('defaults to no restrictions and normalizes domains', () => {
    expect(open).toEqual({ require_sso_for_staff: false, allowed_domains: [], disable_password: false })
    expect(readAuthPolicy({ auth: { allowed_domains: [' Grace.ORG '], require_sso_for_staff: true } }))
      .toEqual({ require_sso_for_staff: true, allowed_domains: ['grace.org'], disable_password: false })
  })
})

describe('checkAuthPolicy', () => {
  it('allows everything by default', () => {
    expect(checkAuthPolicy(open, staff(['password']))).toBeNull()
  })

  it('requires SSO for staff only', () => {
    const p = { ...open, require_sso_for_staff: true }
    expect(checkAuthPolicy(p, staff(['password']))).toBe('sso_required')
    expect(checkAuthPolicy(p, staff(['otp']))).toBe('sso_required') // magic links aren't SSO
    expect(checkAuthPolicy(p, staff(['oauth']))).toBeNull()
    expect(checkAuthPolicy(p, { role: 'student', email: 'kid@grace.org', methods: ['password'] })).toBeNull()
  })

  it('turns passwords off for everyone', () => {
    const p = { ...open, disable_password: true }
    expect(checkAuthPolicy(p, { role: 'student', email: 'a@grace.org', methods: ['password'] })).toBe('password_disabled')
    expect(checkAuthPolicy(p, { role: 'student', email: 'a@grace.org', methods: ['oauth'] })).toBeNull()
  })

  it('restricts email domains exactly (no suffix tricks)', () => {
    const p = { ...open, allowed_domains: ['grace.org'] }
    expect(checkAuthPolicy(p, staff(['oauth'], 'a@grace.org'))).toBeNull()
    expect(checkAuthPolicy(p, staff(['oauth'], 'a@evilgrace.org'))).toBe('domain_not_allowed')
    expect(checkAuthPolicy(p, staff(['oauth'], 'a@grace.org.evil.com'))).toBe('domain_not_allowed')
    expect(checkAuthPolicy(p, staff(['oauth'], null))).toBe('domain_not_allowed')
  })
})

describe('signInMethods / parseDomains', () => {
  it('reads the JWT amr claim', () => {
    expect(signInMethods([{ method: 'password', timestamp: 1 }, { method: 'oauth' }])).toEqual(['password', 'oauth'])
    expect(signInMethods(undefined)).toEqual([])
  })

  it('parses a domain list and reports invalid entries', () => {
    expect(parseDomains('grace.org, @Faith.church  bad_domain, x')).toEqual({ domains: ['grace.org', 'faith.church'], invalid: ['bad_domain', 'x'] })
  })
})
