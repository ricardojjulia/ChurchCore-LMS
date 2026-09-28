// @vitest-environment node
// Rollback when the admin account can't be created after the tenant was
// provisioned (PR #36 review): the org is removed and the link stays usable.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { covers } from '../../../../tests/covers'

covers('api:GET /api/signup/verify')

const m = vi.hoisted(() => ({
  ops: [] as string[],
  createUserFails: true,
}))

vi.mock('@/lib/tenancy/provision', () => ({
  provisionTenant: async () => ({ org: { id: 'org-1', name: 'Grace', slug: 'grace', plan: 'free', status: 'trial', trial_ends_at: null } }),
}))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { verifyOtp: async () => ({ error: null }) } }) }))
vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    auth: {
      admin: {
        createUser: async () => (m.createUserFails ? { data: { user: null }, error: { message: 'x' } } : { data: { user: { id: 'auth-1' } }, error: null }),
        generateLink: async () => ({ data: { properties: { hashed_token: 'h' } } }),
      },
    },
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      let op = ''
      for (const k of ['eq', 'is', 'gt', 'select']) q[k] = () => q
      q.update = (v: Record<string, unknown>) => { op = `update ${table} ${JSON.stringify(v)}`; return q }
      q.delete = () => { op = `delete ${table}`; return q }
      q.maybeSingle = async () => ({ data: { id: 'p-1', email: 'ana@grace.org', payload: { churchName: 'Grace', slug: 'grace', adminName: 'Ana', timezone: 'UTC', locale: 'en' } } })
      q.then = (resolve: (v: unknown) => void) => { m.ops.push(op); resolve({ error: null }) }
      return q
    },
  }),
}))

import { GET } from './route'

const token = 'a'.repeat(43)
const request = () => new NextRequest(`http://localhost/api/signup/verify?token=${token}`)

beforeEach(() => {
  process.env.SELF_SERVE_SIGNUP_ENABLED = 'true'
  m.ops = []
  m.createUserFails = true
})

describe('GET /api/signup/verify', () => {
  it('rolls back the org and un-claims the token when the admin account fails', async () => {
    const res = await GET(request())
    expect(res.headers.get('location')).toBe('/start?error=failed')
    expect(m.ops).toContain('delete organizations')
    expect(m.ops).toContain('update pending_signups {"verified_at":null}')
  })

  it('completes and signs the admin in when everything succeeds', async () => {
    m.createUserFails = false
    const res = await GET(request())
    expect(res.headers.get('location')).toBe('/account/password?welcome=1')
    expect(m.ops).not.toContain('delete organizations')
  })
})
