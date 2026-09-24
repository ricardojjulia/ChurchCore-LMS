// @vitest-environment node
// Link prefetches with a session skip the middleware's network getUser()
// (COUNCIL-2026-033); everything else still verifies and redirects.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ getUser: vi.fn(), user: null as null | { id: string } }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: m.getUser } }),
}))

import { middleware } from '../../../middleware'

function request(path: string, headers: Record<string, string> = {}, session = false) {
  const req = new NextRequest(`http://localhost${path}`, { headers })
  if (session) req.cookies.set('sb-local-auth-token', 'token')
  return req
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  m.user = null
  m.getUser.mockReset().mockImplementation(async () => ({ data: { user: m.user } }))
})

describe('middleware', () => {
  it('skips getUser for a prefetch that carries a session', async () => {
    const res = await middleware(request('/courses', { 'next-router-prefetch': '1' }, true))
    expect(m.getUser).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBeNull()
  })

  it('still redirects a prefetch without a session', async () => {
    const res = await middleware(request('/courses', { 'next-router-prefetch': '1' }))
    expect(m.getUser).toHaveBeenCalledOnce()
    expect(res.headers.get('location')).toContain('/login')
  })

  it('a forged session cookie only skips the middleware check; pages still verify', async () => {
    // Documents the design: the cookie is a name heuristic, so an attacker can
    // skip the middleware round trip on prefetches — but every protected page
    // calls auth.getUser() itself (the page sweep's anon denial checks cover
    // this for every route in tests/playwright/browser/routes.ts).
    const req = new NextRequest('http://localhost/admin/users', { headers: { 'next-router-prefetch': '1' } })
    req.cookies.set('sb-forged-auth-token', 'not-a-real-token')
    const res = await middleware(req)
    expect(m.getUser).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBeNull()
  })

  it('verifies the session on a normal navigation', async () => {
    m.user = { id: 'u1' }
    const res = await middleware(request('/courses', {}, true))
    expect(m.getUser).toHaveBeenCalledOnce()
    expect(res.headers.get('location')).toBeNull()
  })
})
