'use server'

import { headers } from 'next/headers'
import { createServiceClient } from '@/utils/supabase/service'
import { verifyTurnstile } from '@/lib/turnstile'
import { autoEnrollNewJoiner } from '@/lib/join'
import { LIMITS, clientIp, hashId, hit, recordEvent } from '@/lib/auth-throttle'
import { checkPassword, PASSWORD_MESSAGES } from '@/lib/password-policy'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface EnrollParams {
  orgId:          string
  email:          string
  password:       string
  displayName:    string
  turnstileToken: string
}

export async function verifyAndEnroll({
  orgId,
  email,
  password,
  displayName,
  turnstileToken,
}: EnrollParams): Promise<{ error?: string }> {
  // Limits per IP and per church, then the bot check (COUNCIL-2026-045).
  const ip = clientIp(await headers())
  const ipLimit = await hit('join', hashId('ip', ip), LIMITS.joinIp)
  const orgLimit = ipLimit.allowed ? await hit('join', hashId('org', String(orgId)), LIMITS.joinOrg) : ipLimit
  if (!ipLimit.allowed || !orgLimit.allowed) {
    await recordEvent('join_throttled', { ip })
    return { error: 'Too many registrations right now. Please try again later.' }
  }
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    await recordEvent('captcha_failed', { ip })
    return { error: 'Security check failed. Please try again.' }
  }

  const cleanEmail = typeof email === 'string' ? email.trim() : ''
  if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 254) return { error: 'Enter a valid email address.' }
  const name = typeof displayName === 'string' ? displayName.trim() : ''
  if (!name || name.length > 100) return { error: 'Enter your name.' }
  const problem = checkPassword(typeof password === 'string' ? password : '', cleanEmail)
  if (problem) return { error: PASSWORD_MESSAGES[problem] }

  const service = createServiceClient()

  // Confirm org is still active (race condition guard)
  const { data: org } = await service
    .from('organizations')
    .select('id, status, settings')
    .eq('id', orgId)
    .eq('status', 'active')
    .single()

  if (!org) return { error: 'Organization not found or is no longer accepting registrations.' }

  // Create the auth user. handle_new_user() takes org and role only from
  // app_metadata (server-controlled); user_metadata carries the display name.
  // Created confirmed: production requires confirmed emails to sign in and
  // this flow sends no confirmation email, so unconfirmed joiners were locked
  // out. The address owner can always take the account back with a password
  // reset (COUNCIL-2026-045 Decision 5).
  const { data, error: signUpError } = await service.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
    app_metadata:  { org_id: orgId, role: 'student' },
  })

  if (signUpError || !data.user) {
    const msg = signUpError?.message ?? ''
    // Surface duplicate email in a user-friendly way; never return provider text.
    if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
      return { error: 'An account with that email already exists. Try signing in instead.' }
    }
    return { error: 'Registration failed. Please try again.' }
  }

  await autoEnrollNewJoiner(service, org, data.user.id)

  return {}
}
