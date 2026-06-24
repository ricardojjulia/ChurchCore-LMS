'use server'

import { revalidatePath }        from 'next/cache'
import { redirect }              from 'next/navigation'
import { headers }               from 'next/headers'
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

// ─── Demo Scenario Config ─────────────────────────────────────────────────────

type BlockDef = {
  type: string
  content: Record<string, unknown>
}

type CourseDef = {
  title:       string
  description: string
  blocks:      BlockDef[]
}

type ScenarioConfig = {
  label:          string
  termType:       string
  termName:       string
  termCode:       string
  termStartDays:  number   // days offset from today
  termEndDays:    number   // days offset from today
  courses:        CourseDef[]
  cohortName?:    string
  cohortCode?:    string
  hasAgeGate:     boolean  // if true, set age_min=6, age_max=12 on first course
  useProgramTrack:boolean  // if true, create a program_track and link courses
  programTrackName?: string
  programTrackCode?: string
  openEnrollment: boolean  // true → 'open'; false → 'cohort_gated'
}

const DEMO_SCENARIOS: Record<string, ScenarioConfig> = {
  wed_bible_school: {
    label:          'Wednesday Bible School',
    termType:       'series',
    termName:       'Wednesday Bible Studies 2026',
    termCode:       'WBS-2026',
    termStartDays:  -180,
    termEndDays:    185,
    courses: [
      {
        title:       'The Life of Jesus',
        description: 'A survey of the Gospels exploring the life, ministry, and teachings of Jesus Christ.',
        blocks: [
          { type: 'text',  content: { title: 'Welcome', body: '<h2>Welcome to The Life of Jesus</h2><p>We will walk through the four Gospels and discover who Jesus is through His own words and actions.</p>' } },
          { type: 'video', content: { title: 'The Four Gospels', url: 'https://www.youtube.com/watch?v=ak06MSETeo4' } },
          { type: 'quiz',  content: { title: 'Gospel Knowledge Check', pass_percent: 70, questions: [
            { id: 'q1', text: 'Which Gospel is often called the "Gospel of the servant"?', type: 'multiple_choice', options: ['Matthew', 'Mark', 'Luke', 'John'], answer: 1 },
          ] } },
        ],
      },
      {
        title:       'Epistles of Paul',
        description: 'An in-depth study of Paul\'s letters and their theological significance for the church today.',
        blocks: [
          { type: 'text',  content: { title: 'Introduction', body: '<h2>Paul\'s Letters to the Church</h2><p>Paul\'s epistles form a significant portion of the New Testament and continue to shape Christian theology.</p>' } },
          { type: 'video', content: { title: 'Overview of the Epistles', url: 'https://www.youtube.com/watch?v=AavLFNTkLEQ' } },
          { type: 'assignment', content: { title: 'Letter Analysis', prompt: 'Choose one Pauline epistle and write a 300-word summary of its main theological themes.' } },
        ],
      },
    ],
    cohortName:     'Wednesday Night Group',
    cohortCode:     'WNG-2026',
    hasAgeGate:     false,
    useProgramTrack:false,
    openEnrollment: true,
  },

  summer_kids: {
    label:          'Summer School for Kids',
    termType:       'semester',
    termName:       'Summer Kids 2026',
    termCode:       'SKS-2026',
    termStartDays:  7,
    termEndDays:    63,
    courses: [
      {
        title:       'Bible Stories for Kids',
        description: 'Fun, age-appropriate lessons bringing beloved Bible stories to life for children ages 6–12.',
        blocks: [
          { type: 'text',  content: { title: 'Welcome, Kids!', body: '<h2>Welcome to Bible Stories!</h2><p>Get ready to explore amazing stories from the Bible — from Noah\'s Ark to David and Goliath!</p>' } },
          { type: 'video', content: { title: 'The Story of Noah', url: 'https://www.youtube.com/watch?v=u6XAPnuFjJc' } },
          { type: 'quiz',  content: { title: 'Bible Story Quiz', pass_percent: 60, questions: [
            { id: 'q1', text: 'How many days and nights did it rain during Noah\'s flood?', type: 'multiple_choice', options: ['7', '40', '100', '365'], answer: 1 },
          ] } },
        ],
      },
    ],
    cohortName:     'Summer Kids Cohort (Ages 6-12)',
    cohortCode:     'SKC-2026',
    hasAgeGate:     true,
    useProgramTrack:false,
    openEnrollment: false,
  },

  college_semester: {
    label:          'College Semester (Default)',
    termType:       'semester',
    termName:       'Fall Semester 2026',
    termCode:       'FALL-2026',
    termStartDays:  0,
    termEndDays:    112,
    courses: [
      {
        title:       'Old Testament Survey',
        description: 'A comprehensive survey of the Old Testament, covering its major divisions, themes, and historical context.',
        blocks: [
          { type: 'text',  content: { title: 'Welcome', body: '<h2>Welcome to Old Testament Survey</h2><p>We will explore the rich tapestry of the Hebrew Scriptures — from Creation through the return from exile.</p>' } },
          { type: 'video', content: { title: 'Overview of the Old Testament', url: 'https://www.youtube.com/watch?v=ak06MSETeo4' } },
          { type: 'quiz',  content: { title: 'OT Knowledge Check', pass_percent: 70, questions: [
            { id: 'q1', text: 'How many books are in the Old Testament (Protestant canon)?', type: 'multiple_choice', options: ['27', '39', '46', '66'], answer: 1 },
            { id: 'q2', text: 'Which book begins with "In the beginning"?', type: 'multiple_choice', options: ['Exodus', 'Genesis', 'Psalms', 'Isaiah'], answer: 1 },
          ] } },
          { type: 'assignment', content: { title: 'OT Reflection', prompt: 'Choose a psalm and write a 200-word reflection on its meaning for your life today.' } },
        ],
      },
      {
        title:       'New Testament Survey',
        description: 'An overview of the New Testament — the Gospels, Acts, Epistles, and Revelation — and their theological significance.',
        blocks: [
          { type: 'text',  content: { title: 'Introduction', body: '<h2>The New Testament</h2><p>The New Testament reveals Jesus as the fulfillment of the Old Testament promises and the foundation of the Christian faith.</p>' } },
          { type: 'video', content: { title: 'Overview of the New Testament', url: 'https://www.youtube.com/watch?v=AavLFNTkLEQ' } },
          { type: 'quiz',  content: { title: 'NT Knowledge Check', pass_percent: 70, questions: [
            { id: 'q1', text: 'How many books are in the New Testament?', type: 'multiple_choice', options: ['21', '25', '27', '30'], answer: 2 },
          ] } },
        ],
      },
      {
        title:       'Christian Doctrine 101',
        description: 'An introduction to core Christian doctrines: the Trinity, salvation, the church, and eschatology.',
        blocks: [
          { type: 'text',  content: { title: 'Welcome', body: '<h2>What Do Christians Believe?</h2><p>Doctrine shapes how we live. In this course we will examine the foundational beliefs of the Christian faith.</p>' } },
          { type: 'video', content: { title: 'The Trinity Explained', url: 'https://www.youtube.com/watch?v=u6XAPnuFjJc' } },
          { type: 'quiz',  content: { title: 'Doctrine Quiz', pass_percent: 70, questions: [
            { id: 'q1', text: 'Which doctrine refers to God as three persons in one essence?', type: 'multiple_choice', options: ['Tritheism', 'Modalism', 'The Trinity', 'Arianism'], answer: 2 },
          ] } },
          { type: 'assignment', content: { title: 'Creed Reflection', prompt: 'Read the Apostles\' Creed and write a 300-word reflection on which article of faith means most to you and why.' } },
        ],
      },
    ],
    cohortName:     'Fall 2026 Cohort',
    cohortCode:     'F26-COHORT',
    hasAgeGate:     false,
    useProgramTrack:false,
    openEnrollment: false,
  },

  diploma_yearly: {
    label:          '1-Year Bible Diploma',
    termType:       'academic_year',
    termName:       '2026–2027 Ministry Year',
    termCode:       'MIN-2026',
    termStartDays:  0,
    termEndDays:    365,
    courses: [
      {
        title:       'Foundations of Faith',
        description: 'Lays the biblical and theological groundwork for all subsequent courses in the diploma program.',
        blocks: [
          { type: 'text',  content: { title: 'Welcome', body: '<h2>Begin Your Journey</h2><p>This foundational course sets the stage for a year of deep biblical formation and ministry preparation.</p>' } },
          { type: 'assignment', content: { title: 'Faith Statement', prompt: 'Write a personal statement of faith in 400 words.' } },
        ],
      },
      {
        title:       'Biblical Hermeneutics',
        description: 'Teaches the principles and methods of interpreting Scripture faithfully and accurately.',
        blocks: [
          { type: 'text',  content: { title: 'Introduction to Hermeneutics', body: '<h2>How to Read the Bible</h2><p>Hermeneutics is the science and art of biblical interpretation. We will learn principles that unlock the meaning of Scripture.</p>' } },
          { type: 'video', content: { title: 'Principles of Interpretation', url: 'https://www.youtube.com/watch?v=AavLFNTkLEQ' } },
          { type: 'quiz',  content: { title: 'Hermeneutics Check', pass_percent: 70, questions: [
            { id: 'q1', text: 'What does "exegesis" mean?', type: 'multiple_choice', options: ['Reading into the text', 'Drawing meaning out of the text', 'Translating the text', 'Memorizing the text'], answer: 1 },
          ] } },
        ],
      },
      {
        title:       'Church History',
        description: 'Surveys the history of Christianity from the apostolic age to the modern era.',
        blocks: [
          { type: 'text',  content: { title: 'The Story of the Church', body: '<h2>2,000 Years of Christianity</h2><p>Understanding where the church has been helps us navigate where it is going.</p>' } },
          { type: 'video', content: { title: 'The Apostolic Age', url: 'https://www.youtube.com/watch?v=AavLFNTkLEQ' } },
        ],
      },
      {
        title:       'Practical Ministry',
        description: 'Prepares students for active ministry roles through practical training in preaching, counseling, and leadership.',
        blocks: [
          { type: 'text',  content: { title: 'Ministry in Practice', body: '<h2>From Classroom to Calling</h2><p>Ministry knowledge must translate into action. This course bridges theory and real-world ministry service.</p>' } },
          { type: 'assignment', content: { title: 'Ministry Practicum', prompt: 'Document 10 hours of ministry service and write a 500-word reflection on what you learned.' } },
        ],
      },
    ],
    cohortName:       'Diploma Class of 2027',
    cohortCode:       'DIPL-2027',
    hasAgeGate:       false,
    useProgramTrack:  true,
    programTrackName: 'Bible Diploma Track',
    programTrackCode: 'BIBL-DIPL',
    openEnrollment:   false,
  },

  ministry_leaders: {
    label:          'Ministry Education for Leaders',
    termType:       'self_paced',
    termName:       'Ministry Leadership Program',
    termCode:       'MLP-OPEN',
    termStartDays:  0,
    termEndDays:    730,
    courses: [
      {
        title:       'Leadership in the Church',
        description: 'Explores biblical models of leadership and equips ministry leaders to lead with integrity and vision.',
        blocks: [
          { type: 'text',  content: { title: 'What Makes a Leader?', body: '<h2>Leadership in the Church</h2><p>Effective church leadership begins with character, not competency. We will examine biblical models from Moses to Paul.</p>' } },
          { type: 'video', content: { title: 'Servant Leadership', url: 'https://www.youtube.com/watch?v=u6XAPnuFjJc' } },
          { type: 'assignment', content: { title: 'Leadership Self-Assessment', prompt: 'Complete the leadership self-assessment and write a 300-word reflection on your strengths and growth areas.' } },
        ],
      },
      {
        title:       'Preaching & Teaching',
        description: 'Develops practical skills in sermon preparation, delivery, and effective teaching methodology.',
        blocks: [
          { type: 'text',  content: { title: 'The Art of Preaching', body: '<h2>Rightly Dividing the Word</h2><p>Effective preaching requires careful exegesis, clear structure, and Spirit-led delivery.</p>' } },
          { type: 'assignment', content: { title: 'Sermon Outline', prompt: 'Prepare a 20-minute sermon outline on a passage of your choosing, including introduction, three main points, and conclusion.' } },
        ],
      },
      {
        title:       'Pastoral Care',
        description: 'Equips leaders with the skills to provide compassionate care, counseling, and support to their congregations.',
        blocks: [
          { type: 'text',  content: { title: 'Caring for the Flock', body: '<h2>Pastoral Care in Practice</h2><p>Shepherding a congregation means being present in both celebration and suffering. This course prepares you for both.</p>' } },
          { type: 'video', content: { title: 'Principles of Pastoral Counseling', url: 'https://www.youtube.com/watch?v=ak06MSETeo4' } },
          { type: 'quiz',  content: { title: 'Pastoral Care Principles', pass_percent: 70, questions: [
            { id: 'q1', text: 'What is the primary role of a pastor during a crisis?', type: 'multiple_choice', options: ['Provide solutions immediately', 'Offer presence and prayerful support', 'Refer everyone to professional counselors', 'Share a relevant sermon'], answer: 1 },
          ] } },
        ],
      },
    ],
    cohortName:     undefined,
    cohortCode:     undefined,
    hasAgeGate:     false,
    useProgramTrack:false,
    openEnrollment: true,
  },
}

// ─── Reset Tenant to Demo Data ────────────────────────────────────────────────
export async function resetTenantToDemo(
  orgId:    string,
  scenario: string = 'college_semester',
) {
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

  const studentAuthIds = ['student1', 'student2', 'student3']
    .map(p => createdAuthIds[p])
    .filter(Boolean)

  // ── 4. Determine which scenarios to seed ─────────────────────────────────
  const scenarioKeys: string[] = scenario === 'all_scenarios'
    ? ['wed_bible_school', 'summer_kids', 'college_semester', 'diploma_yearly', 'ministry_leaders']
    : [scenario in DEMO_SCENARIOS ? scenario : 'college_semester']

  const allCourseIds: string[] = []

  for (const key of scenarioKeys) {
    const cfg = DEMO_SCENARIOS[key]
    if (!cfg) continue

    const prefix = scenario === 'all_scenarios'
      ? `[${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace('Wed ', 'Weds ')}] `
      : ''

    // ── 4a. Create academic term ──────────────────────────────────────────
    const now      = Date.now()
    const startISO = new Date(now + cfg.termStartDays * 86_400_000).toISOString().slice(0, 10)
    const endISO   = new Date(now + cfg.termEndDays   * 86_400_000).toISOString().slice(0, 10)

    const { data: term } = await service.from('academic_terms').insert({
      org_id:     orgId,
      term_name:  cfg.termName,
      term_code:  scenario === 'all_scenarios' ? `${key.toUpperCase().slice(0, 4)}-${cfg.termCode}` : cfg.termCode,
      type:       cfg.termType,
      start_date: startISO,
      end_date:   endISO,
      created_by: adminAuthId ?? actor.id,
      is_active:  true,
    }).select('id').single()

    // ── 4b. Create courses ────────────────────────────────────────────────
    const scenarioCourseIds: string[] = []
    for (let ci = 0; ci < cfg.courses.length; ci++) {
      if (!ownerUid) continue
      const cd = cfg.courses[ci]

      const { data: course } = await service
        .from('courses')
        .insert({
          org_id:      orgId,
          owner_id:    ownerUid,
          title:       `${prefix}${cd.title}`,
          description: cd.description,
          status:      'published',
          ...(cfg.hasAgeGate && ci === 0 ? { age_min: 6, age_max: 12 } : {}),
        })
        .select('id').single()

      if (course) {
        scenarioCourseIds.push(course.id)
        allCourseIds.push(course.id)

        await service.from('course_blocks').insert(
          cd.blocks.map((b, i) => ({
            course_id: course.id,
            org_id:    orgId,
            type:      b.type,
            position:  i,
            content:   b.content,
          }))
        )

        // Create section linked to term
        if (term) {
          await service.from('course_sections').insert({
            course_id:       course.id,
            org_id:          orgId,
            term_id:         term.id,
            section_name:    `${prefix}${cd.title} — Section 1`,
            enrollment_type: cfg.openEnrollment ? 'open' : 'cohort_gated',
            is_active:       true,
          })
        }
      }
    }

    // ── 4c. Create program track (if applicable) ──────────────────────────
    if (cfg.useProgramTrack && cfg.programTrackName && cfg.programTrackCode && scenarioCourseIds.length) {
      const { data: track } = await service.from('program_tracks').insert({
        org_id:     orgId,
        name:       cfg.programTrackName,
        code:       cfg.programTrackCode,
        created_by: adminAuthId ?? actor.id,
        is_active:  true,
      }).select('id').single()

      if (track) {
        await service.from('program_track_courses').insert(
          scenarioCourseIds.map((courseId, idx) => ({
            track_id:       track.id,
            course_id:      courseId,
            sequence_order: idx + 1,
            is_required:    true,
          }))
        )
      }
    }

    // ── 4d. Create cohort (if applicable) ────────────────────────────────
    if (cfg.cohortName) {
      const cohortCode = scenario === 'all_scenarios'
        ? `${key.toUpperCase().slice(0, 4)}-${cfg.cohortCode ?? key.toUpperCase()}`
        : (cfg.cohortCode ?? `${slug}-COHORT`)

      const { data: cohort } = await service.from('global_cohorts').insert({
        org_id:      orgId,
        cohort_name: `${prefix}${cfg.cohortName}`,
        cohort_code: cohortCode,
        created_by:  actor.id,
        is_active:   true,
      }).select('id').single()

      // Add students as cohort members
      if (cohort && studentAuthIds.length) {
        await service.from('cohort_members').insert(
          studentAuthIds.map(authId => ({
            cohort_id: cohort.id,
            user_id:   authId,
          }))
        )
      }
    }
  }

  // ── 5. Enroll students in all courses ────────────────────────────────────
  const enrollments = studentAuthIds.flatMap(authId =>
    allCourseIds.map(courseId => ({
      course_id: courseId,
      user_id:   authId,
      role:      'student',
      status:    'active',
      source:    'admin',
    }))
  )
  if (enrollments.length) await service.from('course_enrollments').insert(enrollments)

  // ── 6. Create welcome announcements ──────────────────────────────────────
  if (ownerUid) {
    const scenarioLabel = scenario === 'all_scenarios'
      ? 'All Scenarios (Full Demo)'
      : (DEMO_SCENARIOS[scenario]?.label ?? 'College Semester (Default)')

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
        title: `Demo Scenario: ${scenarioLabel}`,
        body:  `This tenant has been seeded with the "${scenarioLabel}" demo scenario. Use the platform credentials to explore the experience.`,
      },
    ])
  }

  // ── 7. Store demo credentials + scenario in org settings ─────────────────
  await service.from('organizations').update({
    settings: {
      ...(org?.settings ?? {}),
      demo: {
        seeded_at:     new Date().toISOString(),
        scenario,
        admin_email:   `admin@${slug}.demo`,
        teacher_email: `teacher@${slug}.demo`,
        password:      DEMO_PASSWORD,
      },
    },
  }).eq('id', orgId)

  await logAction(actor.id, 'reset_tenant_demo', orgId, { scenario })
  revalidatePath('/platform')
  revalidatePath(`/platform/tenants/${orgId}`)
}

// ─── Generate One-Time Demo Admin Login Link ──────────────────────────────────
export async function generateDemoLoginLink(
  orgId: string,
  email: string,
): Promise<{ url: string } | { error: string }> {
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  const hdrs   = await headers()
  const host   = hdrs.get('host') ?? 'localhost:3000'
  const proto  = hdrs.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const origin = `${proto}://${host}`

  // Verify the email belongs to this org's demo users
  const { data: org } = await service.from('organizations').select('settings').eq('id', orgId).single()
  if (!org) return { error: 'Organization not found' }

  const demo = org.settings?.demo as { password?: string; admin_email?: string; teacher_email?: string } | undefined
  if (!demo?.password) return { error: 'No demo data seeded for this tenant' }
  if (email !== demo.admin_email && email !== demo.teacher_email) {
    return { error: 'Email is not a recognized demo user for this tenant' }
  }

  // Store a one-time token in org settings (expires in 15 minutes).
  // The /api/auth/demo-login route validates this token and signs in via password.
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const pendingLogin = { token, email, org_id: orgId, expires_at: expiresAt }

  const updatedSettings = {
    ...org.settings,
    demo: { ...demo, pending_login: pendingLogin },
  }
  const { error: updateErr } = await service
    .from('organizations')
    .update({ settings: updatedSettings })
    .eq('id', orgId)
  if (updateErr) return { error: 'Failed to prepare login token' }

  await logAction(actor.id, 'generate_demo_login', orgId, { email })

  return { url: `${origin}/api/auth/demo-login?t=${token}&org=${orgId}` }
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
