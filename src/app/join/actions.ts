'use server'

import { createServiceClient } from '@/utils/supabase/service'
import { verifyTurnstile } from '@/lib/turnstile'
import { autoEnrollNewJoiner } from '@/lib/join'

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
  // Verify Turnstile token server-side before creating the account
  if (!(await verifyTurnstile(turnstileToken))) return { error: 'Security check failed. Please try again.' }

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
  const { data, error: signUpError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { display_name: displayName },
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
