'use server'

import { revalidatePath }        from 'next/cache'
import { redirect }              from 'next/navigation'
import { createServerClient }    from '@/lib/supabase/server'
import { createServiceClient }   from '@/utils/supabase/service'

async function assertPlatformAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (!isAdmin) throw new Error('Forbidden')
  return user
}

async function logAction(
  actorId: string,
  action: string,
  targetOrg: string | null,
  payload?: Record<string, unknown>,
) {
  const service = createServiceClient()
  await service.from('platform_audit_log').insert({
    actor_id: actorId,
    action,
    target_org: targetOrg,
    payload: payload ?? null,
  })
}

// ─── Create Tenant ────────────────────────────────────────────────────────────
export async function createTenant(formData: FormData) {
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  const name       = formData.get('name') as string
  const slug       = formData.get('slug') as string
  const plan       = (formData.get('plan') as string) || 'free'
  const trialDays  = Number(formData.get('trial_days') ?? 14)
  const adminEmail = (formData.get('admin_email') as string | null)?.trim() || null

  const features = {
    ai_tutor:        formData.get('feat_ai_tutor') === 'on',
    guardian_portal: formData.get('feat_guardian') === 'on',
    leaderboard:     formData.get('feat_leaderboard') === 'on',
    hq:              formData.get('feat_hq') === 'on',
    reporting:       formData.get('feat_reporting') === 'on',
  }

  const { data: org, error: orgErr } = await service
    .from('organizations')
    .insert({
      name,
      slug,
      plan,
      status: plan === 'free' ? 'trial' : 'active',
      trial_ends_at: plan === 'free'
        ? new Date(Date.now() + trialDays * 86_400_000).toISOString()
        : null,
      settings: {
        branding: {},
        features,
        onboarding: {
          logo_uploaded:                false,
          first_teacher_invited:        false,
          first_course_created:         false,
          first_announcement_published: false,
        },
      },
    })
    .select()
    .single()

  if (orgErr) throw new Error(orgErr.message)

  if (adminEmail) {
    const { error: inviteErr } = await service.auth.admin.inviteUserByEmail(adminEmail, {
      data: { org_id: org.id, role: 'admin' },
    })
    if (inviteErr) console.warn('Invite failed:', inviteErr.message)
  }

  await logAction(actor.id, 'create_tenant', org.id, {
    name: org.name,
    plan: org.plan,
    admin_email: adminEmail,
  })

  redirect(`/platform/tenants/${org.id}`)
}

// ─── Suspend Tenant ───────────────────────────────────────────────────────────
export async function suspendTenant(orgId: string) {
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  await service.from('organizations').update({ status: 'suspended' }).eq('id', orgId)
  await service.rpc('sync_org_status_to_profiles', { p_org_id: orgId })
  await logAction(actor.id, 'suspend_tenant', orgId)

  revalidatePath('/platform')
}

// ─── Restore Tenant ───────────────────────────────────────────────────────────
export async function restoreTenant(orgId: string) {
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  await service.from('organizations').update({ status: 'active' }).eq('id', orgId)
  await service.rpc('sync_org_status_to_profiles', { p_org_id: orgId })
  await logAction(actor.id, 'restore_tenant', orgId)

  revalidatePath('/platform')
}

// ─── Soft Delete Tenant ───────────────────────────────────────────────────────
export async function softDeleteTenant(orgId: string) {
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  await service.from('organizations')
    .update({ status: 'deleted', deleted_at: new Date().toISOString() })
    .eq('id', orgId)
  await service.rpc('sync_org_status_to_profiles', { p_org_id: orgId })
  await logAction(actor.id, 'soft_delete_tenant', orgId)

  revalidatePath('/platform')
  redirect('/platform')
}

// ─── Reset Tenant to Empty (keep users) ──────────────────────────────────────
export async function resetTenantToEmpty(orgId: string) {
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  // Delete leaf-level records first to avoid FK violations, then parent tables.
  // courses cascades: course_blocks, course_enrollments, block_submissions,
  //   content_pages, course_certificates, enrollment_audit_log.
  // global_cohorts cascades: cohort_members, cohort_section_enrollments, enrollment_jobs.
  // course_sections cascades: section_groups, section_group_members, access_windows.
  // hq_sessions cascades: hq_tasks, hq_risks, hq_decisions.
  // question_banks cascades: bank_questions.

  await Promise.all([
    service.from('announcements').delete().eq('org_id', orgId),
    service.from('engagement_events').delete().eq('org_id', orgId),
    service.from('engagement_streaks').delete().eq('org_id', orgId),
  ])

  await Promise.all([
    service.from('hq_sessions').delete().eq('org_id', orgId),
    service.from('courses').delete().eq('org_id', orgId),
    service.from('question_banks').delete().eq('org_id', orgId),
    service.from('course_blueprints').delete().eq('org_id', orgId),
  ])

  await Promise.all([
    service.from('global_cohorts').delete().eq('org_id', orgId),
    service.from('course_sections').delete().eq('org_id', orgId),
    service.from('academic_terms').delete().eq('org_id', orgId),
    service.from('program_tracks').delete().eq('org_id', orgId),
  ])

  await logAction(actor.id, 'reset_tenant_empty', orgId)
  revalidatePath('/platform')
  revalidatePath(`/platform/tenants/${orgId}`)
}

// ─── Reset Tenant to Demo Data ────────────────────────────────────────────────
export async function resetTenantToDemo(orgId: string) {
  // First wipe existing content
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  await Promise.all([
    service.from('announcements').delete().eq('org_id', orgId),
    service.from('engagement_events').delete().eq('org_id', orgId),
    service.from('engagement_streaks').delete().eq('org_id', orgId),
  ])
  await Promise.all([
    service.from('hq_sessions').delete().eq('org_id', orgId),
    service.from('courses').delete().eq('org_id', orgId),
    service.from('question_banks').delete().eq('org_id', orgId),
    service.from('course_blueprints').delete().eq('org_id', orgId),
  ])
  await Promise.all([
    service.from('global_cohorts').delete().eq('org_id', orgId),
    service.from('course_sections').delete().eq('org_id', orgId),
    service.from('academic_terms').delete().eq('org_id', orgId),
    service.from('program_tracks').delete().eq('org_id', orgId),
  ])

  // courses.owner_id and announcements.created_by require a valid profiles.uid.
  // Prefer an existing org admin; fall back to the platform actor's own profile
  // so seeding always works even for empty tenants that have no users yet.
  const [{ data: orgAdmin }, { data: actorProfile }] = await Promise.all([
    service.from('profiles').select('uid').eq('org_id', orgId).in('role', ['admin', 'manager']).limit(1).single(),
    service.from('profiles').select('uid').eq('auth_id', actor.id).single(),
  ])
  const ownerUid = orgAdmin?.uid ?? actorProfile?.uid

  if (ownerUid) {
    const { data: course } = await service
      .from('courses')
      .insert({
        org_id:      orgId,
        owner_id:    ownerUid,
        title:       'Introduction to Faith & Learning',
        description: 'A sample course to help you explore the ChurchCore LMS platform.',
        status:      'published',
      })
      .select('id')
      .single()

    if (course) {
      await service.from('course_blocks').insert([
        {
          course_id: course.id,
          org_id:    orgId,
          type:      'text',
          position:  0,
          content:   {
            title: 'Welcome',
            body:  '<h2>Welcome to ChurchCore LMS!</h2><p>This is a sample course to help you explore the platform. You can edit or delete this content at any time.</p>',
          },
        },
        {
          course_id: course.id,
          org_id:    orgId,
          type:      'video',
          position:  1,
          content:   {
            title: 'Platform Overview',
            url:   'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          },
        },
        {
          course_id: course.id,
          org_id:    orgId,
          type:      'quiz',
          position:  2,
          content:   {
            title:     'Check Your Understanding',
            questions: [
              {
                id:      'q1',
                text:    'What is the primary purpose of ChurchCore LMS?',
                type:    'multiple_choice',
                options: ['Manage finances', 'Deliver ministry learning', 'Schedule services', 'Track attendance'],
                answer:  1,
              },
            ],
            pass_percent: 80,
          },
        },
      ])
    }

    await service.from('announcements').insert({
      org_id:       orgId,
      created_by:   ownerUid,
      title:        'Welcome to ChurchCore LMS!',
      body:         'Your demo environment is ready. Explore courses, invite users, and customize your organization settings.',
      scope:        'global',
      is_published: true,
      published_at: new Date().toISOString(),
    })
  }

  await service.from('global_cohorts').insert({
    org_id: orgId,
    name:   'Sample Group',
    status: 'active',
  })

  await logAction(actor.id, 'reset_tenant_demo', orgId)
  revalidatePath('/platform')
  revalidatePath(`/platform/tenants/${orgId}`)
}

// ─── Update Tenant Settings ───────────────────────────────────────────────────
export async function updateTenant(orgId: string, formData: FormData) {
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  const { data: existing } = await service
    .from('organizations').select('settings').eq('id', orgId).single()

  const updatedSettings = {
    ...(existing?.settings ?? {}),
    branding: {
      ...(existing?.settings?.branding ?? {}),
      logo_url:       (formData.get('logo_url') as string) || undefined,
      primary_color:  (formData.get('primary_color') as string) || undefined,
      email_from_name:(formData.get('email_from_name') as string) || undefined,
    },
    features: {
      ai_tutor:        formData.get('feat_ai_tutor') === 'on',
      guardian_portal: formData.get('feat_guardian') === 'on',
      leaderboard:     formData.get('feat_leaderboard') === 'on',
      hq:              formData.get('feat_hq') === 'on',
      reporting:       formData.get('feat_reporting') === 'on',
    },
  }

  await service.from('organizations').update({
    name:     formData.get('name') as string,
    plan:     formData.get('plan') as string,
    settings: updatedSettings,
  }).eq('id', orgId)

  await logAction(actor.id, 'update_tenant', orgId, { name: formData.get('name') })

  revalidatePath(`/platform/tenants/${orgId}`)
  redirect(`/platform/tenants/${orgId}`)
}
