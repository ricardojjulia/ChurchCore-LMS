import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { updateAuthPolicy } from '@/app/actions/org-settings'
import { covers } from '../covers'

covers('action:org-settings.updateAuthPolicy')

// COUNCIL-2026-037 — updateAuthPolicy: admin only, rejects bad domains, and
// refuses any policy that would sign the saving admin out.
// @/utils/supabase/server is mocked globally by src/tests/setup.ts; the
// service client gets a local mock, as in org-settings-auto-enroll.test.ts.

vi.mock('@/utils/supabase/service', () => ({ createServiceClient: vi.fn() }))

const ORG = 'org-aaaaaaaa-0000-0000-0000-000000000001'

function sessionClient({
  authenticated = true,
  orgId = ORG,
  role = 'admin',
  email = 'pastor@grace.example',
  amr = [{ method: 'password' }],
}: { authenticated?: boolean; orgId?: string; role?: string; email?: string; amr?: unknown[] } = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: authenticated ? { id: 'auth-caller', email } : null }, error: null }),
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { amr } }, error: null }),
    },
    from: vi.fn().mockImplementation(() => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { org_id: orgId, role }, error: null }) }) }),
    })),
  }
}

function serviceClient(updateError: unknown = null) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) })
  const client = {
    from: vi.fn().mockImplementation(() => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { settings: { branding: { primary_color: '#123456' } } }, error: null }) }) }),
      update,
    })),
  }
  vi.mocked(createServiceClient).mockReturnValue(client as never)
  return { update }
}

const input = (over: Partial<{ require_sso_for_staff: boolean; disable_password: boolean; allowed_domains: string }> = {}) => ({
  require_sso_for_staff: false, disable_password: false, allowed_domains: '', ...over,
})

function asCaller(opts: Parameters<typeof sessionClient>[0] = {}) {
  vi.mocked(createClient).mockResolvedValueOnce(sessionClient(opts) as never)
}

describe('updateAuthPolicy', () => {
  const prev = process.env.NEXT_PUBLIC_SSO_PROVIDERS
  beforeEach(() => { vi.clearAllMocks(); process.env.NEXT_PUBLIC_SSO_PROVIDERS = 'google,azure' })
  afterEach(() => { process.env.NEXT_PUBLIC_SSO_PROVIDERS = prev })

  it('saves the policy and keeps other settings (happy path)', async () => {
    asCaller()
    const { update } = serviceClient()
    const res = await updateAuthPolicy(ORG, input({ allowed_domains: 'Grace.Example, other.org' }))
    expect(res).toEqual({})
    expect(update).toHaveBeenCalledWith({
      settings: {
        branding: { primary_color: '#123456' },
        auth: { require_sso_for_staff: false, disable_password: false, allowed_domains: ['grace.example', 'other.org'] },
      },
    })
  })

  it('refuses a signed-out caller', async () => {
    asCaller({ authenticated: false })
    expect(await updateAuthPolicy(ORG, input())).toEqual({ error: 'Not signed in.' })
  })

  it('refuses managers and admins of another org', async () => {
    asCaller({ role: 'manager' })
    expect((await updateAuthPolicy(ORG, input())).error).toMatch(/Only an admin/)
    asCaller({ orgId: 'org-other' })
    expect((await updateAuthPolicy(ORG, input())).error).toMatch(/Only an admin/)
  })

  it('rejects an invalid domain (validation failure)', async () => {
    asCaller()
    expect((await updateAuthPolicy(ORG, input({ allowed_domains: 'not a domain' }))).error).toMatch(/Not a valid domain/)
  })

  it('refuses SSO-only options when no provider is configured', async () => {
    process.env.NEXT_PUBLIC_SSO_PROVIDERS = ''
    asCaller()
    expect((await updateAuthPolicy(ORG, input({ disable_password: true }))).error).toMatch(/isn’t set up/)
  })

  it('refuses a domain list that excludes the admin', async () => {
    asCaller()
    expect((await updateAuthPolicy(ORG, input({ allowed_domains: 'other.org' }))).error)
      .toBe('Your own email domain must be in the allowed list.')
  })

  it('refuses turning passwords off from a password session, allows it from SSO', async () => {
    asCaller()
    expect((await updateAuthPolicy(ORG, input({ disable_password: true }))).error).toMatch(/Sign in with Google or Microsoft first/)

    asCaller({ amr: [{ method: 'oauth' }] })
    serviceClient()
    expect(await updateAuthPolicy(ORG, input({ disable_password: true, require_sso_for_staff: true }))).toEqual({})
  })

  it('returns a generic error when the save fails (no raw DB error)', async () => {
    asCaller()
    serviceClient({ message: 'relation "organizations" violates something internal' })
    expect(await updateAuthPolicy(ORG, input())).toEqual({ error: 'Could not save the sign-in settings. Please try again.' })
  })
})
