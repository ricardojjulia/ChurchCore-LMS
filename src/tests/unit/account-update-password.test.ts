// @vitest-environment node
// updatePassword (COUNCIL-2026-045): policy, current-password check unless
// the session came from a fresh reset/one-time link, other sessions ended.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import { covers } from '../covers'

covers('action:account.updatePassword')

const m = vi.hoisted(() => ({
  probeSignIn: vi.fn(),
  probeSignOut: vi.fn(),
  events: [] as string[],
  limited: false,
}))

vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithPassword: m.probeSignIn, signOut: m.probeSignOut } }),
}))
vi.mock('@/lib/auth-throttle', async (orig) => {
  const real = await orig<typeof import('@/lib/auth-throttle')>()
  return {
    ...real,
    hit: async () => ({ allowed: !m.limited, retryAfter: 60 }),
    recordEvent: async (event: string) => { m.events.push(event) },
  }
})

import { updatePassword } from '@/app/actions/account'

const now = () => Math.floor(Date.now() / 1000)

function session({ user = { id: 'a1', email: 'ana@grace.org' } as { id: string; email?: string } | null, amr = [{ method: 'password', timestamp: now() }], updateError = null as unknown } = {}) {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { amr } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: updateError }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }
  vi.mocked(createClient).mockResolvedValueOnce(client as never)
  return client
}

beforeEach(() => {
  m.events = []; m.limited = false
  m.probeSignIn.mockReset().mockResolvedValue({ error: null })
  m.probeSignOut.mockReset().mockResolvedValue({ error: null })
})

describe('updatePassword', () => {
  it('changes the password after checking the current one, and ends other sessions (happy path)', async () => {
    const c = session()
    expect(await updatePassword({ current: 'old password 1', password: 'new password 22' })).toEqual({})
    expect(m.probeSignIn).toHaveBeenCalledWith({ email: 'ana@grace.org', password: 'old password 1' })
    expect(m.probeSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(c.auth.updateUser).toHaveBeenCalledWith({ password: 'new password 22' })
    expect(c.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
    expect(m.events).toEqual(['password_changed'])
  })

  it('skips the current password for a fresh reset-link session', async () => {
    const c = session({ amr: [{ method: 'recovery', timestamp: now() - 60 }] })
    expect(await updatePassword({ password: 'new password 22' })).toEqual({})
    expect(m.probeSignIn).not.toHaveBeenCalled()
    expect(c.auth.updateUser).toHaveBeenCalled()
  })

  it('still asks for it once the link session is older than 30 minutes', async () => {
    session({ amr: [{ method: 'otp', timestamp: now() - 31 * 60 }] })
    expect(await updatePassword({ password: 'new password 22' })).toEqual({ error: 'current_required' })
  })

  it('rejects a weak password or the same password (validation failure)', async () => {
    session()
    expect(await updatePassword({ current: 'x', password: 'short' })).toEqual({ error: 'too_short' })
    session()
    expect(await updatePassword({ current: 'x', password: 'password123' })).toEqual({ error: 'too_common' })
    session()
    expect(await updatePassword({ current: 'same password 1', password: 'same password 1' })).toEqual({ error: 'same' })
  })

  it('rejects a wrong current password and records it', async () => {
    const c = session()
    m.probeSignIn.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    expect(await updatePassword({ current: 'wrong one 1', password: 'new password 22' })).toEqual({ error: 'wrong_current' })
    expect(c.auth.updateUser).not.toHaveBeenCalled()
    expect(m.events).toEqual(['login_failed'])
  })

  it('is limited like sign-in, so it cannot be used to guess faster', async () => {
    session()
    m.limited = true
    expect(await updatePassword({ current: 'guess 1234', password: 'new password 22' })).toEqual({ error: 'too_many' })
    expect(m.probeSignIn).not.toHaveBeenCalled()
  })

  it('needs a signed-in user (not found)', async () => {
    session({ user: null })
    expect(await updatePassword({ password: 'new password 22' })).toEqual({ error: 'not_signed_in' })
  })

  it('returns a generic error when the update fails', async () => {
    session({ updateError: { code: 'unexpected_failure', message: 'db exploded' } })
    expect(await updatePassword({ current: 'old password 1', password: 'new password 22' })).toEqual({ error: 'generic' })
  })
})
