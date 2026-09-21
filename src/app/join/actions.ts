'use server'

import { createServiceClient } from '@/utils/supabase/service'
import { enrollCore } from '@/lib/enrollment-core'

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
    .select('id, status, settings')
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

  // Auto-enroll into any courses this org has configured for new joiners
  // (organizations.settings.auto_enroll_courses, COUNCIL-2026-026 D3). Runs
  // through the same enrollCore() gate as any other enrollment, so an
  // invite-only/cohort-gated/prerequisite-gated course is silently skipped
  // rather than failing. Best-effort — a failure here must never block
  // account creation, which has already succeeded at this point.
  const autoEnrollCourseIds = Array.isArray(
    (org.settings as { auto_enroll_courses?: unknown } | null)?.auto_enroll_courses
  )
    ? ((org.settings as { auto_enroll_courses: string[] }).auto_enroll_courses).slice(0, 10)
    : []

  for (const courseId of autoEnrollCourseIds) {
    try {
      // Defense-in-depth re-check: addAutoEnrollCourse() already validates a
      // course belongs to the org before it can be added, but this list is
      // read here independently at registration time (possibly long after
      // it was configured), so re-confirm both org ownership and published
      // status rather than trusting the stored JSONB entry as-is — a course
      // can be unpublished for revision after being opted into auto-enroll.
      const { data: courseCheck } = await service
        .from('courses')
        .select('id')
        .eq('id', courseId)
        .eq('org_id', orgId)
        .eq('status', 'published')
        .maybeSingle()

      if (!courseCheck) continue

      await enrollCore({
        supabase: service,
        authId:   data.user.id,
        courseId,
        requireVerifiableAge: true,
      })
    } catch {
      // Auto-enrollment failure must never block registration
    }
  }

  return {}
}
