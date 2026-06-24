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
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  // ── 1. Wipe existing content ──────────────────────────────────────────────
  const { data: org } = await service
    .from('organizations').select('slug, settings').eq('id', orgId).single()
  const slug = org?.slug ?? 'demo'

  // Delete old demo auth users from previous seeds (identified by email pattern)
  const { data: oldDemoProfiles } = await service
    .from('profiles').select('auth_id').ilike('email', `%@${slug}.demo`)
  for (const p of oldDemoProfiles ?? []) {
    if (p.auth_id) await service.auth.admin.deleteUser(p.auth_id)
  }

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

  // ── 2. Create demo users ──────────────────────────────────────────────────
  // handle_new_user trigger auto-creates profiles + profile_roles from metadata.
  const DEMO_PASSWORD = 'Demo@2026!'
  const demoUserDefs = [
    { prefix: 'admin',    role: 'admin',   fullName: 'Alex Admin'     },
    { prefix: 'teacher',  role: 'teacher', fullName: 'Taylor Martin'  },
    { prefix: 'student1', role: 'student', fullName: 'Jordan Smith'   },
    { prefix: 'student2', role: 'student', fullName: 'Casey Johnson'  },
    { prefix: 'student3', role: 'student', fullName: 'Riley Williams' },
  ]

  const createdAuthIds: Record<string, string> = {}
  for (const u of demoUserDefs) {
    const email = `${u.prefix}@${slug}.demo`
    const { data: created } = await service.auth.admin.createUser({
      email,
      password:      DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.fullName, org_id: orgId, role: u.role },
    })
    if (created.user) createdAuthIds[u.prefix] = created.user.id
  }

  // ── 3. Resolve admin profile uid for owner_id / created_by ───────────────
  // Trigger is synchronous, so profile exists by now. Fall back to actor if not.
  const adminAuthId = createdAuthIds['admin']
  let ownerUid: string | null = null
  if (adminAuthId) {
    const { data: p } = await service.from('profiles').select('uid').eq('auth_id', adminAuthId).single()
    ownerUid = p?.uid ?? null
  }
  if (!ownerUid) {
    const { data: p } = await service.from('profiles').select('uid').eq('auth_id', actor.id).single()
    ownerUid = p?.uid ?? null
  }

  // ── 4. Create 3 courses with blocks ──────────────────────────────────────
  const courseDefs = [
    {
      title:       'Introduction to Biblical Studies',
      description: 'A foundational course exploring the structure, history, and major themes of Scripture.',
      blocks: [
        { type: 'text',  content: { title: 'Welcome', body: '<h2>Welcome to Biblical Studies</h2><p>In this course you will explore the foundations of Scripture — its history, structure, and enduring relevance.</p>' } },
        { type: 'video', content: { title: 'Overview of the Bible', url: 'https://www.youtube.com/watch?v=ak06MSETeo4' } },
        { type: 'quiz',  content: { title: 'Check Your Understanding', pass_percent: 70, questions: [
          { id: 'q1', text: 'How many books are in the Protestant Bible?', type: 'multiple_choice', options: ['39', '66', '73', '81'], answer: 1 },
          { id: 'q2', text: 'What language was most of the New Testament originally written in?', type: 'multiple_choice', options: ['Hebrew', 'Latin', 'Greek', 'Aramaic'], answer: 2 },
        ] } },
        { type: 'assignment', content: { title: 'Scripture Journal Entry', prompt: 'Choose a passage from the Psalms and write a 200-word reflection on its meaning to you.' } },
      ],
    },
    {
      title:       'Church History I: The Early Church',
      description: 'Traces Christianity from the apostolic age through the first ecumenical councils.',
      blocks: [
        { type: 'text',  content: { title: 'Introduction', body: '<h2>The Story of the Early Church</h2><p>Christianity spread rapidly across the Roman Empire in the first centuries, facing persecution, theological controversy, and remarkable growth.</p>' } },
        { type: 'video', content: { title: 'The Apostolic Age', url: 'https://www.youtube.com/watch?v=AavLFNTkLEQ' } },
        { type: 'quiz',  content: { title: 'Early Church Quiz', pass_percent: 70, questions: [
          { id: 'q1', text: 'In what year did the Council of Nicaea take place?', type: 'multiple_choice', options: ['AD 100', 'AD 325', 'AD 451', 'AD 800'], answer: 1 },
          { id: 'q2', text: 'Who was the primary author of the Nicene Creed?', type: 'multiple_choice', options: ['Augustine', 'Origen', 'Athanasius', 'Tertullian'], answer: 2 },
        ] } },
      ],
    },
    {
      title:       'Ministry Leadership Foundations',
      description: 'Equips ministry leaders with practical skills in servant leadership, vision, and team development.',
      blocks: [
        { type: 'text',  content: { title: 'Servant Leadership', body: '<h2>Leading Like Jesus</h2><p>The greatest leaders in ministry history exemplified servant leadership — placing the needs of others above their own ambitions.</p>' } },
        { type: 'video', content: { title: 'Vision and Mission', url: 'https://www.youtube.com/watch?v=u6XAPnuFjJc' } },
        { type: 'quiz',  content: { title: 'Leadership Principles', pass_percent: 70, questions: [
          { id: 'q1', text: 'Which best describes servant leadership?', type: 'multiple_choice', options: ['Leading from authority', 'Serving the needs of others first', 'Delegating all tasks', 'Maintaining hierarchy'], answer: 1 },
        ] } },
        { type: 'assignment', content: { title: 'Personal Leadership Statement', prompt: 'Write a 300-word personal leadership philosophy grounded in Scripture.' } },
      ],
    },
  ]

  const createdCourseIds: string[] = []
  for (const cd of courseDefs) {
    if (!ownerUid) continue
    const { data: course } = await service
      .from('courses')
      .insert({ org_id: orgId, owner_id: ownerUid, title: cd.title, description: cd.description, status: 'published' })
      .select('id').single()
    if (course) {
      createdCourseIds.push(course.id)
      await service.from('course_blocks').insert(
        cd.blocks.map((b, i) => ({ course_id: course.id, org_id: orgId, type: b.type, position: i, content: b.content }))
      )
    }
  }

  // ── 5. Enroll students in all courses ────────────────────────────────────
  const studentAuthIds = ['student1', 'student2', 'student3'].map(p => createdAuthIds[p]).filter(Boolean)
  const enrollments = studentAuthIds.flatMap(authId =>
    createdCourseIds.map(courseId => ({
      course_id: courseId, user_id: authId, role: 'student', status: 'active', source: 'admin',
    }))
  )
  if (enrollments.length) await service.from('course_enrollments').insert(enrollments)

  // ── 6. Create cohort ──────────────────────────────────────────────────────
  await service.from('global_cohorts').insert({
    org_id:      orgId,
    cohort_name: 'Fall 2026 Cohort',
    cohort_code: `${slug}-F26`,
    created_by:  actor.id,
    is_active:   true,
  })

  // ── 7. Create term ────────────────────────────────────────────────────────
  await service.from('academic_terms').insert({
    org_id:     orgId,
    term_name:  'Fall 2026',
    term_code:  `${slug}-FALL-2026`,
    type:       'semester',
    start_date: '2026-09-01',
    end_date:   '2026-12-15',
    created_by: actor.id,
    is_active:  true,
  })

  // ── 8. Create announcements ───────────────────────────────────────────────
  if (ownerUid) {
    await service.from('announcements').insert([
      {
        org_id: orgId, created_by: ownerUid, scope: 'global', is_published: true,
        published_at: new Date().toISOString(),
        title: 'Welcome to Your Learning Community!',
        body:  'Your ChurchCore LMS is now live. Explore your courses, connect with fellow students, and begin your learning journey today.',
      },
      {
        org_id: orgId, created_by: ownerUid, scope: 'global', is_published: true,
        published_at: new Date().toISOString(),
        title: 'Fall 2026 Semester Begins September 1',
        body:  'Enrollment for Fall 2026 is now open. Secure your spot in Biblical Studies, Church History, and Ministry Leadership by August 15th.',
      },
    ])
  }

  // ── 9. Store demo credentials in org settings for display in platform UI ──
  await service.from('organizations').update({
    settings: {
      ...(org?.settings ?? {}),
      demo: {
        seeded_at:    new Date().toISOString(),
        admin_email:  `admin@${slug}.demo`,
        teacher_email:`teacher@${slug}.demo`,
        password:     DEMO_PASSWORD,
      },
    },
  }).eq('id', orgId)

  await logAction(actor.id, 'reset_tenant_demo', orgId)
  revalidatePath('/platform')
  revalidatePath(`/platform/tenants/${orgId}`)
}

// ─── Generate One-Time Demo Admin Login Link ──────────────────────────────────
export async function generateDemoLoginLink(
  orgId: string,
  email: string,
): Promise<{ url: string } | { error: string }> {
  await assertPlatformAdmin()
  const service = createServiceClient()

  const { data, error } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (error || !data?.properties?.action_link) {
    return { error: error?.message ?? 'Failed to generate link' }
  }

  await logAction(
    (await (await createServerClient()).auth.getUser()).data.user!.id,
    'generate_demo_login',
    orgId,
    { email },
  )

  return { url: data.properties.action_link }
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
