'use server'

import { createClient as createStatelessClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { checkPassword, linkSessionIsFresh, type PasswordProblem } from '@/lib/password-policy'
import { LIMITS, clientIp, hashId, hit, recordEvent } from '@/lib/auth-throttle'

export type PasswordError = PasswordProblem | 'wrong_current' | 'current_required' | 'not_signed_in' | 'same' | 'too_many' | 'generic'

export async function updatePassword(input: { current?: string; password: string }): Promise<{ error?: PasswordError }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: 'not_signed_in' }

  const password = typeof input.password === 'string' ? input.password : ''
  const problem = checkPassword(password, user.email)
  if (problem) return { error: problem }

  const { data: claims } = await supabase.auth.getClaims()
  if (!linkSessionIsFresh(claims?.claims?.amr)) {
    const current = typeof input.current === 'string' ? input.current : ''
    if (!current) return { error: 'current_required' }
    if (current === password) return { error: 'same' }
    // Counted against the same per-email limit as sign-in, so this can't be
    // used to guess the current password faster than /login allows.
    const ip = clientIp(await headers())
    const limit = await hit('login', hashId('email', user.email), LIMITS.loginEmail)
    if (!limit.allowed) {
      await recordEvent('login_throttled', { ip, email: user.email })
      return { error: 'too_many' }
    }
    // Check the current password on a throwaway client that keeps no
    // session, then end the session that check created.
    const probe = createStatelessClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: wrong } = await probe.auth.signInWithPassword({ email: user.email, password: current })
    if (wrong) {
      await recordEvent('login_failed', { ip, email: user.email })
      return { error: 'wrong_current' }
    }
    await probe.auth.signOut({ scope: 'local' })
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.code === 'same_password' ? 'same' : 'generic' }
  // Anyone else holding a session for this account is signed out.
  await supabase.auth.signOut({ scope: 'others' })
  await recordEvent('password_changed', { email: user.email })
  return {}
}
