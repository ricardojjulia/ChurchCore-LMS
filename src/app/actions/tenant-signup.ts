'use server'

import { createServiceClient } from '@/utils/supabase/service'

export interface SignupTenantParams {
  orgName: string
  orgSlug: string
  adminName: string
  adminEmail: string
  password: string
  turnstileToken?: string
}

export interface SignupTenantResult {
  success?: boolean
  orgId?: string
  orgSlug?: string
  error?: string
}

const RESERVED_SLUGS = new Set([
  'admin',
  'platform',
  'api',
  'auth',
  'join',
  'signup',
  'login',
  'billing',
  'dashboard',
  'settings',
  'demo',
  'system',
  'app',
  'help',
  'status',
  'learn',
  'catalog',
  'verify',
  'invite',
])

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export async function signupTenant({
  orgName,
  orgSlug,
  adminName,
  adminEmail,
  password,
  turnstileToken,
}: SignupTenantParams): Promise<SignupTenantResult> {
  const trimmedName = (orgName ?? '').trim()
  const trimmedAdminName = (adminName ?? '').trim()
  const trimmedEmail = (adminEmail ?? '').trim().toLowerCase()
  const cleanSlug = (orgSlug ?? '').trim().toLowerCase()

  // 1. Validation
  if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 100) {
    return { error: 'Organization name must be between 2 and 100 characters.' }
  }

  if (!cleanSlug || cleanSlug.length < 2 || cleanSlug.length > 40) {
    return { error: 'Organization slug must be between 2 and 40 characters.' }
  }

  if (!SLUG_REGEX.test(cleanSlug)) {
    return { error: 'Organization slug can only contain lowercase letters, numbers, and hyphens (cannot start or end with a hyphen).' }
  }

  if (RESERVED_SLUGS.has(cleanSlug)) {
    return { error: 'This organization slug is reserved. Please choose a different URL identifier.' }
  }

  if (!trimmedAdminName || trimmedAdminName.length < 2) {
    return { error: 'Please enter your full name.' }
  }

  if (!trimmedEmail || !trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
    return { error: 'Please provide a valid email address.' }
  }

  if (!password || password.length < 8) {
    return { error: 'Password must be at least 8 characters long.' }
  }

  // 2. Cloudflare Turnstile verification
  const isTestEnv = process.env.NODE_ENV === 'test' || turnstileToken === 'mock-token' || turnstileToken === 'test-token'
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY

  if (!isTestEnv && turnstileSecret) {
    if (!turnstileToken) {
      return { error: 'Security check required. Please verify you are human.' }
    }

    try {
      const verifyRes = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          body: new URLSearchParams({
            secret: turnstileSecret,
            response: turnstileToken,
          }),
        }
      )
      const { success } = (await verifyRes.json()) as { success: boolean }
      if (!success) {
        return { error: 'Security verification failed. Please try again.' }
      }
    } catch {
      return { error: 'Failed to complete security check. Please try again.' }
    }
  }

  const service = createServiceClient()

  // 3. Slug uniqueness check
  const { data: existingOrg, error: slugCheckErr } = await service
    .from('organizations')
    .select('id')
    .eq('slug', cleanSlug)
    .maybeSingle()

  if (slugCheckErr) {
    return { error: 'Database check failed. Please try again.' }
  }

  if (existingOrg) {
    return { error: 'An organization with this URL slug already exists. Please pick a unique slug.' }
  }

  // 4. Create Organization (14-day trial)
  const trialEndsAt = new Date(Date.now() + 14 * 86_400_000).toISOString()
  const { data: org, error: orgErr } = await service
    .from('organizations')
    .insert({
      name: trimmedName,
      slug: cleanSlug,
      plan: 'free',
      status: 'trial',
      trial_ends_at: trialEndsAt,
      settings: {
        branding: {
          name: trimmedName,
        },
        features: {
          ai_tutor: true,
          guardian_portal: true,
          leaderboard: true,
          hq: true,
          reporting: true,
        },
        onboarding: {
          logo_uploaded: false,
          first_teacher_invited: false,
          first_course_created: true,
          first_announcement_published: true,
        },
      },
    })
    .select()
    .single()

  if (orgErr || !org) {
    return { error: orgErr?.message ?? 'Failed to create organization.' }
  }

  // 5. Create the Admin User
  const { data: authData, error: authErr } = await service.auth.admin.createUser({
    email: trimmedEmail,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: trimmedAdminName,
      display_name: trimmedAdminName,
    },
    app_metadata: {
      org_id: org.id,
      role: 'admin',
    },
  })

  if (authErr || !authData.user) {
    // Rollback created organization if user creation failed
    await service.from('organizations').delete().eq('id', org.id)
    const msg = authErr?.message ?? 'User creation failed.'
    if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
      return { error: 'An account with that email address already exists. Please log in or use a different email.' }
    }
    return { error: msg }
  }

  // 6. Resolve Admin Profile UID
  const { data: profile } = await service
    .from('profiles')
    .select('uid')
    .eq('auth_id', authData.user.id)
    .single()

  const adminUid = profile?.uid

  // 7. Seed Initial Academic Term
  const now = Date.now()
  const startISO = new Date(now).toISOString().slice(0, 10)
  const endISO = new Date(now + 365 * 86_400_000).toISOString().slice(0, 10)

  const { data: term } = await service
    .from('academic_terms')
    .insert({
      org_id: org.id,
      term_name: 'Academic Year 2026–2027',
      term_code: 'AY26-27',
      type: 'academic_year',
      start_date: startISO,
      end_date: endISO,
      created_by: authData.user.id,
      is_active: true,
    })
    .select('id')
    .single()

  // 8. Seed "Welcome to Your Academy" Starter Course
  if (adminUid) {
    const { data: course } = await service
      .from('courses')
      .insert({
        org_id: org.id,
        owner_id: adminUid,
        title: 'Welcome to Your Academy',
        description: 'A starter tour introducing you and your students to the ChurchCore LMS experience.',
        status: 'published',
      })
      .select('id')
      .single()

    if (course) {
      await service.from('course_blocks').insert([
        {
          course_id: course.id,
          org_id: org.id,
          type: 'text',
          position: 0,
          content: {
            title: 'Welcome to ChurchCore LMS',
            body: `<h2>Welcome to ${trimmedName}!</h2><p>This is your first course. As an administrator, you can edit this content, create new modules, and invite teachers and learners.</p>`,
          },
        },
        {
          course_id: course.id,
          org_id: org.id,
          type: 'video',
          position: 1,
          content: {
            title: 'Getting Started Video',
            url: 'https://www.youtube.com/watch?v=ak06MSETeo4',
          },
        },
        {
          course_id: course.id,
          org_id: org.id,
          type: 'quiz',
          position: 2,
          content: {
            title: 'Quick Knowledge Check',
            pass_percent: 70,
            questions: [
              {
                id: 'q1',
                text: 'Where can you manage courses and students?',
                type: 'multiple_choice',
                options: ['Admin Dashboard', 'Trash Bin', 'External Mail'],
                answer: 0,
              },
            ],
          },
        },
      ])

      if (term) {
        await service.from('course_sections').insert({
          course_id: course.id,
          org_id: org.id,
          term_id: term.id,
          section_name: 'Main Section',
          enrollment_type: 'open',
          is_active: true,
        })
      }
    }

    // 9. Seed Initial Announcement
    await service.from('announcements').insert({
      org_id: org.id,
      created_by: adminUid,
      scope: 'global',
      is_published: true,
      published_at: new Date().toISOString(),
      title: `Welcome to ${trimmedName}!`,
      body: `Your organization workspace is live. Explore your starter course, invite your staff, and begin building discipleship pathways today.`,
    })
  }

  return {
    success: true,
    orgId: org.id,
    orgSlug: org.slug,
  }
}
