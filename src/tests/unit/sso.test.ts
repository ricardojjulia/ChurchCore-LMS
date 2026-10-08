import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { configuredSsoProviders } from '@/lib/sso'


describe('COUNCIL-2026-037: SSO & Social Logins (Google, Microsoft & ChurchCore OIDC)', () => {
  const originalEnv = process.env.NEXT_PUBLIC_SSO_PROVIDERS

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SSO_PROVIDERS
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_SSO_PROVIDERS = originalEnv
  })

  it('returns empty array when NEXT_PUBLIC_SSO_PROVIDERS is not set', () => {
    expect(configuredSsoProviders()).toEqual([])
  })

  it('parses and filters valid SSO providers correctly including churchcore', () => {
    process.env.NEXT_PUBLIC_SSO_PROVIDERS = 'google, azure, churchcore, unknown_provider'
    expect(configuredSsoProviders()).toEqual(['google', 'azure', 'churchcore'])
  })

  it('handles case-insensitivity and trims whitespace', () => {
    process.env.NEXT_PUBLIC_SSO_PROVIDERS = '  GOOGLE , Azure  '
    expect(configuredSsoProviders()).toEqual(['google', 'azure'])
  })
})
