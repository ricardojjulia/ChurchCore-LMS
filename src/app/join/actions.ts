'use server'

import { createServiceClient } from '@/utils/supabase/service'

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
  const verifyRes = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      body: new URLSearchParams({
        secret:   process.env.TURNSTILE_SECRET_KEY ?? '',
        response: turnstileToken,
      }),
    }
  )
  const { success } = (await verifyRes.json()) as { success: boolean }
  if (!success) return { error: 'Security check failed. Please try again.' }

  const service = createServiceClient()

  // Confirm org is still active (race condition guard)
  const { data: org } = await service
    .from('organizations')
    .select('id, status')
    .eq('id', orgId)
    .eq('status', 'active')
    .single()

  if (!org) return { error: 'Organization not found or is no longer accepting registrations.' }

  // Create the auth user — raw_user_meta_data passes org_id and display_name
  // to the handle_new_user trigger which sets profiles.org_id.
  const { data, error: signUpError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: {
      org_id:       orgId,
      display_name: displayName,
      role:         'student',
    },
  })

  if (signUpError || !data.user) {
    const msg = signUpError?.message ?? 'Registration failed.'
    // Surface duplicate email in a user-friendly way
    if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
      return { error: 'An account with that email already exists. Try signing in instead.' }
    }
    return { error: msg }
  }

  return {}
}
