#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const args = new Map()
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split('=')
  args.set(key, value ?? true)
}

const confirm = args.get('--confirm') === true
const retainEmail = String(args.get('--retain-email') ?? '').trim().toLowerCase()

if (!confirm || !retainEmail) {
  console.error(`
Refusing to run destructive demo reset.

Usage:
  node scripts/reset-demo-data.mjs --confirm --retain-email=you@example.com

Required:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY

This deletes LMS demo/domain data, deletes auth users except the retained email,
keeps or creates the retained user's admin profile, then creates full demo data.
`)
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !anonKey || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const password = 'ChurchCoreDemo!2026'
const demoDomain = 'demo.churchcore.local'
const uid = () => randomUUID()
const iso = (date) => new Date(date).toISOString()
const dateOnly = (date) => new Date(date).toISOString().slice(0, 10)

async function must(label, promise) {
  const { data, error } = await promise
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

async function maybeDelete(table, column = 'id', keep = '00000000-0000-0000-0000-000000000000') {
  const { error } = await supabase.from(table).delete().neq(column, keep)
  if (error && !/does not exist|Could not find|schema cache/i.test(error.message)) {
    throw new Error(`clear ${table}: ${error.message}`)
  }
}

async function listAllUsers() {
  const users = []
  for (let page = 1; page < 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`list auth users: ${error.message}`)
    users.push(...(data.users ?? []))
    if ((data.users ?? []).length < 1000) break
  }
  return users
}

async function ensureAuthUser(email, displayName, role) {
  const users = await listAllUsers()
  const existing = users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
  if (existing) return existing

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, role },
  })
  if (error) throw new Error(`create auth user ${email}: ${error.message}`)
  return data.user
}

async function main() {
  console.log(`Preparing destructive demo reset for ${supabaseUrl}`)
  const authUsers = await listAllUsers()
  const retained = authUsers.find((user) => user.email?.toLowerCase() === retainEmail)
  if (!retained) {
    throw new Error(`Retained auth user not found: ${retainEmail}`)
  }

  const { data: retainedProfile } = await supabase
    .from('profiles')
    .select('uid')
    .eq('auth_id', retained.id)
    .maybeSingle()

  const retainedUid = retainedProfile?.uid ?? uid()

  const domainTables = [
    'messages',
    'message_thread_participants',
    'message_threads',
    'notifications',
    'announcement_reads',
    'announcements',
    'calendar_events',
    'course_certificates',
    'block_submissions',
    'course_blocks',
    'enrollments',
    'course_enrollments',
    'enrollment_audit_log',
    'direct_enrollments',
    'cohort_section_enrollments',
    'enrollment_jobs',
    'section_group_messages',
    'section_group_members',
    'section_groups',
    'cohort_members',
    'global_cohorts',
    'access_windows',
    'meeting_schedules',
    'embedding_jobs',
    'embeddings',
    'content_pages',
    'courses',
    'course_sections',
    'course_blueprints',
    'academic_terms',
    'program_tracks',
    'profile_badges',
    'badges',
    'org_members',
    'organizations',
    'hq_sessions',
    'hq_tasks',
    'hq_risks',
    'hq_decisions',
    'system_health_checks',
  ]

  for (const table of domainTables) await maybeDelete(table)
  await maybeDelete('profile_roles', 'auth_id', retained.id)
  await maybeDelete('profiles', 'uid', retainedUid)

  for (const user of authUsers) {
    if (user.id !== retained.id) {
      const { error } = await supabase.auth.admin.deleteUser(user.id)
      if (error) throw new Error(`delete auth user ${user.email}: ${error.message}`)
    }
  }

  const retainedProfilePayload = {
    uid: retainedUid,
    auth_id: retained.id,
    email: retained.email,
    display_name: retained.user_metadata?.display_name ?? retained.email ?? 'Demo Owner',
    role: 'admin',
    status: 'active',
    xp_points: 8500,
    current_level: 8,
  }

  await must('upsert retained profile', supabase.from('profiles').upsert(retainedProfilePayload, { onConflict: 'uid' }))

  const demoPeople = [
    ['manager.academic@demo.churchcore.local', 'Academic Demo Manager', 'manager', 5200],
    ['teacher.bible@demo.churchcore.local', 'Dr. Miriam Torres', 'teacher', 4200],
    ['teacher.leadership@demo.churchcore.local', 'Pastor Caleb Owens', 'teacher', 3900],
    ['teacher.formation@demo.churchcore.local', 'Rev. Ana Whitfield', 'teacher', 3100],
    ['student.bible01@demo.churchcore.local', 'Eli Matthews', 'student', 760],
    ['student.bible02@demo.churchcore.local', 'Naomi Carter', 'student', 690],
    ['student.bible03@demo.churchcore.local', 'Jonah Reed', 'student', 820],
    ['student.bible04@demo.churchcore.local', 'Grace Park', 'student', 540],
    ['student.bible05@demo.churchcore.local', 'Micah Brooks', 'student', 470],
    ['student.bible06@demo.churchcore.local', 'Leah Morgan', 'student', 910],
    ['student.bible07@demo.churchcore.local', 'Isaiah Dunn', 'student', 330],
    ['student.bible08@demo.churchcore.local', 'Phoebe Lewis', 'student', 610],
    ['student.bible09@demo.churchcore.local', 'Silas Rivera', 'student', 720],
    ['student.bible10@demo.churchcore.local', 'Hannah Price', 'student', 490],
    ['student.assoc01@demo.churchcore.local', 'Priscilla Adams', 'student', 2100],
    ['student.assoc02@demo.churchcore.local', 'Timothy Chen', 'student', 1880],
    ['student.assoc03@demo.churchcore.local', 'Lydia James', 'student', 2440],
    ['student.assoc04@demo.churchcore.local', 'Andrew Bell', 'student', 1710],
    ['student.assoc05@demo.churchcore.local', 'Tabitha Ross', 'student', 1975],
    ['member01@demo.churchcore.local', 'New Member Ava', 'student', 120],
    ['member02@demo.churchcore.local', 'New Member Ben', 'student', 80],
    ['member03@demo.churchcore.local', 'New Member Chloe', 'student', 95],
    ['member04@demo.churchcore.local', 'New Member Daniel', 'student', 60],
    ['forge01@demo.churchcore.local', 'Forge Resident One', 'student', 1350],
    ['forge02@demo.churchcore.local', 'Forge Resident Two', 'student', 1420],
    ['leader01@demo.churchcore.local', 'Leader Candidate One', 'student', 1210],
    ['leader02@demo.churchcore.local', 'Leader Candidate Two', 'student', 1160],
  ]

  const people = new Map()
  for (const [email, displayName, role, xpPoints] of demoPeople) {
    const user = await ensureAuthUser(email, displayName, role)
    const profile = {
      uid: uid(),
      auth_id: user.id,
      email,
      display_name: displayName,
      role,
      status: 'active',
      xp_points: xpPoints,
      current_level: xpPoints >= 2000 ? 6 : xpPoints >= 1000 ? 5 : xpPoints >= 500 ? 4 : 2,
    }
    people.set(email, profile)
  }

  const demoAuthIds = [...people.values()].map((profile) => profile.auth_id)
  await must('clear auto-created demo profile roles', supabase.from('profile_roles').delete().in('auth_id', demoAuthIds))
  await must('clear auto-created demo profiles', supabase.from('profiles').delete().in('auth_id', demoAuthIds))
  await must('insert demo profiles', supabase.from('profiles').insert([...people.values()]))

  const teacherBible = people.get(`teacher.bible@${demoDomain}`).uid
  const teacherLeadership = people.get(`teacher.leadership@${demoDomain}`).uid
  const teacherFormation = people.get(`teacher.formation@${demoDomain}`).uid

  const orgId = uid()
  await must('insert organization', supabase.from('organizations').insert({
    id: orgId,
    name: 'ChurchCore Demo Seminary',
    slug: 'churchcore-demo-seminary',
    settings: { demo: true, campus: 'Hybrid + Remote' },
  }))

  await must('insert org members', supabase.from('org_members').insert([
    { org_id: orgId, user_id: retained.id, role: 'owner' },
    { org_id: orgId, user_id: people.get(`manager.academic@${demoDomain}`).auth_id, role: 'admin' },
    ...['teacher.bible', 'teacher.leadership', 'teacher.formation'].map((prefix) => ({
      org_id: orgId,
      user_id: people.get(`${prefix}@${demoDomain}`).auth_id,
      role: 'admin',
    })),
  ]))

  const trackData = [
    ['fybsd', 'First Year Bible Studies Diploma', 'FYBSD', 'Single-year diploma track: 8 courses, 5 weeks each, hybrid delivery.'],
    ['associates', 'Associate of Biblical Studies - Year Two', 'ABS-Y2', 'Second-year associate degree pathway for continuing students.'],
    ['new-members', 'New Members Discipleship', 'NMD', 'Four Monday formation path for new church members.'],
    ['remote-study', 'Remote Bible Study Group', 'RBS', 'Remote self-paced study group with weekly Wednesday rhythm.'],
    ['forge', 'The Forge Ministry Formation', 'FORGE', 'Apprenticeship-style formation for ministry residents.'],
    ['leadership', 'Christian Leadership Development', 'CLD', 'Leadership program for ministry team leads and emerging elders.'],
  ]

  const tracks = Object.fromEntries(trackData.map(([key]) => [key, uid()]))
  await must('insert program tracks', supabase.from('program_tracks').insert(trackData.map(([key, name, code, description]) => ({
    id: tracks[key],
    name,
    code,
    description,
    created_by: retained.id,
  }))))

  const termData = [
    ['fy-fall', 'FYBSD Fall 2026', 'FYBSD-FALL-2026', 'semester', '2026-08-01', '2026-12-31'],
    ['fy-spring', 'FYBSD January-December 2027', 'FYBSD-2027', 'academic_year', '2027-01-01', '2027-12-31'],
    ['assoc-fall', 'Associate Year Two Fall 2026', 'ABS-Y2-FALL-2026', 'semester', '2026-08-01', '2026-12-31'],
    ['assoc-spring', 'Associate Year Two Spring 2027', 'ABS-Y2-SPRING-2027', 'semester', '2027-01-01', '2027-06-30'],
    ['sept-members', 'New Members September 2026', 'NMD-SEP-2026', 'block', '2026-09-01', '2026-09-30'],
    ['remote-year', 'Remote Bible Study 2026-2027', 'RBS-2026-2027', 'series', '2026-09-02', '2027-08-25'],
    ['forge-year', 'Forge Residency 2026-2027', 'FORGE-2026-2027', 'series', '2026-09-01', '2027-05-31'],
    ['leadership-year', 'Christian Leadership 2026-2027', 'CLD-2026-2027', 'series', '2026-09-01', '2027-05-31'],
  ]

  const terms = Object.fromEntries(termData.map(([key]) => [key, uid()]))
  await must('insert terms', supabase.from('academic_terms').insert(termData.map(([key, term_name, term_code, type, start_date, end_date]) => ({
    id: terms[key],
    term_name,
    term_code,
    type,
    start_date,
    end_date,
    config: { timezone: 'America/New_York', demo: true },
    created_by: retained.id,
  }))))

  const blueprintSpecs = [
    ['ot-survey', tracks.fybsd, 'BIB-101', 'Old Testament Survey', 'Genesis through Malachi with covenant, kingdom, and wisdom themes.'],
    ['nt-survey', tracks.fybsd, 'BIB-102', 'New Testament Survey', 'Gospels, Acts, epistles, and Revelation in canonical context.'],
    ['hermeneutics', tracks.fybsd, 'BIB-103', 'Biblical Interpretation', 'Sound interpretation, genre, context, and faithful application.'],
    ['theology', tracks.fybsd, 'THEO-101', 'Foundations of Christian Theology', 'Doctrine of God, Scripture, salvation, church, and mission.'],
    ['formation', tracks.fybsd, 'MIN-101', 'Spiritual Formation', 'Practices of prayer, Scripture, community, and personal holiness.'],
    ['church-history', tracks.fybsd, 'CHH-101', 'Church History I', 'Early church through Reformation highlights for ministry students.'],
    ['gospels-acts', tracks.fybsd, 'BIB-104', 'Gospels and Acts', 'Jesus, the kingdom, Pentecost, and early mission.'],
    ['ministry-practice', tracks.fybsd, 'MIN-102', 'Ministry Practice and Leadership', 'Foundational ministry habits, team care, and service planning.'],
    ['pauline', tracks.associates, 'BIB-201', 'Pauline Epistles', 'Pauline theology, pastoral concerns, and missional communities.'],
    ['prophets', tracks.associates, 'BIB-202', 'Prophets and Justice', 'Major and minor prophets with justice, worship, and hope.'],
    ['theology2', tracks.associates, 'THEO-201', 'Systematic Theology II', 'Christology, pneumatology, ecclesiology, and eschatology.'],
    ['preaching', tracks.associates, 'HOM-201', 'Homiletics and Teaching Lab', 'Sermon development, teaching practice, and feedback loops.'],
    ['pastoral-care', tracks.associates, 'MIN-201', 'Pastoral Care and Counseling', 'Care, presence, referral wisdom, and ethical boundaries.'],
    ['missions', tracks.associates, 'MIS-201', 'Mission and Evangelism', 'Biblical mission, local witness, and cross-cultural sensitivity.'],
    ['ethics', tracks.associates, 'ETH-201', 'Christian Ethics', 'Moral reasoning, formation, and practical dilemmas.'],
    ['capstone', tracks.associates, 'CAP-201', 'Associate Capstone Practicum', 'Integrative ministry project with mentor review.'],
    ['new-members', tracks['new-members'], 'DISC-101', 'New Members Discipleship', 'Four Monday path into doctrine, community, serving, and mission.'],
    ['remote-john', tracks['remote-study'], 'RBS-101', 'Remote Bible Study: Gospel of John', 'Remote self-paced year-long Bible study with weekly Wednesday rhythm.'],
    ['forge-core', tracks.forge, 'FORGE-101', 'Forge Residency Core', 'Calling, discipline, service, theological reflection, and ministry craft.'],
    ['leadership-core', tracks.leadership, 'CLD-101', 'Christian Leadership Foundations', 'Character, team leadership, conflict, vision, and pastoral accountability.'],
  ]

  const blueprints = Object.fromEntries(blueprintSpecs.map(([key]) => [key, uid()]))
  await must('insert blueprints', supabase.from('course_blueprints').insert(blueprintSpecs.map(([key, trackId, course_code, title, description]) => ({
    id: blueprints[key],
    program_track_id: trackId,
    course_code,
    title,
    description,
    credits: course_code.startsWith('DISC') || course_code.startsWith('RBS') ? 0 : 3,
    created_by: retained.id,
  }))))

  const courseRows = blueprintSpecs.map(([key, , course_code, title, description], index) => ({
    id: uid(),
    title,
    description,
    status: 'published',
    owner_id: course_code.startsWith('CLD') || course_code.startsWith('FORGE') ? teacherLeadership
      : course_code.startsWith('DISC') ? teacherFormation
      : teacherBible,
    min_required_level: course_code.startsWith('BIB-2') || course_code.startsWith('THEO-2') ? 3 : 1,
    blueprint_id: blueprints[key],
    org_id: orgId,
    created_at: iso(new Date(Date.UTC(2026, 5, 1 + index))),
  }))
  const courseByBlueprint = Object.fromEntries(blueprintSpecs.map(([key], index) => [key, courseRows[index].id]))
  await must('insert courses', supabase.from('courses').insert(courseRows))

  const blockRows = []
  const assessableBlocksByCourse = new Map()
  for (const course of courseRows) {
    const module1 = uid()
    const module2 = uid()
    const assignment = uid()
    const quiz = uid()
    assessableBlocksByCourse.set(course.id, { assignment, quiz })
    blockRows.push(
      { id: module1, course_id: course.id, block_type_id: 'module_header', title: 'Week 1-2: Foundations', sort_order: 100, is_published: true },
      { id: uid(), course_id: course.id, parent_block_id: module1, block_type_id: 'page', title: 'Course Welcome and Outcomes', sort_order: 110, content: { body: `Welcome to ${course.title}. Review outcomes, rhythm, and expectations.` }, gamification: { base_xp_reward: 20 }, is_published: true },
      { id: uid(), course_id: course.id, parent_block_id: module1, block_type_id: 'video_stream', title: 'Opening Lecture', sort_order: 120, content: { url: 'https://example.com/demo-video', duration_minutes: 18 }, gamification: { base_xp_reward: 35 }, is_published: true },
      { id: uid(), course_id: course.id, parent_block_id: module1, block_type_id: 'discussion', title: 'Formation Discussion', sort_order: 130, content: { prompt: 'What did this week clarify, challenge, or invite you to practice?' }, gamification: { base_xp_reward: 25 }, is_published: true },
      { id: module2, course_id: course.id, block_type_id: 'module_header', title: 'Week 3-5: Practice and Assessment', sort_order: 200, is_published: true },
      { id: assignment, course_id: course.id, parent_block_id: module2, block_type_id: 'assignment', title: 'Reflection Assignment', sort_order: 210, content: { instructions: 'Submit a 700-word reflection connecting the readings to ministry practice.', submission_type: 'text', max_points: 100 }, gamification: { base_xp_reward: 60 }, is_published: true },
      { id: quiz, course_id: course.id, parent_block_id: module2, block_type_id: 'quiz', title: 'Knowledge Check', sort_order: 220, content: { instructions: 'Complete the checkpoint quiz.', attempts_allowed: 2, questions: [{ id: uid(), text: 'This demo course is part of a structured program pathway.', type: 'true_false', options: ['True', 'False'], correct_index: 0, points: 10 }] }, gamification: { base_xp_reward: 40 }, is_published: true },
    )
  }
  await must('insert course blocks', supabase.from('course_blocks').insert(blockRows.map((row) => ({
    content: {},
    settings: {},
    gamification: {},
    ...row,
  }))))

  const sectionSpecs = [
    ['ot-survey', 'fy-fall', 'FALL-A', 'hybrid', '2026-08-03', '2026-09-06'],
    ['nt-survey', 'fy-fall', 'FALL-A', 'hybrid', '2026-09-07', '2026-10-11'],
    ['hermeneutics', 'fy-fall', 'FALL-A', 'hybrid', '2026-10-12', '2026-11-15'],
    ['theology', 'fy-fall', 'FALL-A', 'hybrid', '2026-11-16', '2026-12-20'],
    ['formation', 'fy-spring', 'SPRING-A', 'hybrid', '2027-01-05', '2027-02-08'],
    ['church-history', 'fy-spring', 'SPRING-A', 'hybrid', '2027-02-09', '2027-03-15'],
    ['gospels-acts', 'fy-spring', 'SPRING-A', 'hybrid', '2027-03-16', '2027-04-19'],
    ['ministry-practice', 'fy-spring', 'SPRING-A', 'hybrid', '2027-04-20', '2027-05-24'],
    ['pauline', 'assoc-fall', 'Y2-A', 'hybrid', '2026-08-10', '2026-09-13'],
    ['prophets', 'assoc-fall', 'Y2-A', 'hybrid', '2026-09-14', '2026-10-18'],
    ['theology2', 'assoc-fall', 'Y2-A', 'hybrid', '2026-10-19', '2026-11-22'],
    ['preaching', 'assoc-fall', 'Y2-A', 'hybrid', '2026-11-23', '2026-12-27'],
    ['pastoral-care', 'assoc-spring', 'Y2-A', 'hybrid', '2027-01-11', '2027-02-14'],
    ['missions', 'assoc-spring', 'Y2-A', 'hybrid', '2027-02-15', '2027-03-21'],
    ['ethics', 'assoc-spring', 'Y2-A', 'hybrid', '2027-03-22', '2027-04-25'],
    ['capstone', 'assoc-spring', 'Y2-A', 'hybrid', '2027-04-26', '2027-05-30'],
    ['new-members', 'sept-members', 'MONDAY-SEP', 'hybrid', '2026-09-07', '2026-09-28'],
    ['remote-john', 'remote-year', 'WED-REMOTE', 'self_paced', '2026-09-02', '2027-08-25'],
    ['forge-core', 'forge-year', 'RES-A', 'hybrid', '2026-09-01', '2027-05-31'],
    ['leadership-core', 'leadership-year', 'LEAD-A', 'hybrid', '2026-09-01', '2027-05-31'],
  ]

  const sections = {}
  const sectionRows = []
  const accessRows = []
  for (const [key, termKey, section_code, delivery_format, start, end] of sectionSpecs) {
    const id = uid()
    sections[`${key}:${section_code}`] = id
    sectionRows.push({
      id,
      blueprint_id: blueprints[key],
      term_id: terms[termKey],
      section_code,
      delivery_format,
      max_enrollment: key === 'remote-john' ? 10 : key === 'new-members' ? 20 : 30,
      enrollment_open_date: iso(new Date(`${start}T04:00:00Z`)),
      enrollment_close_date: iso(new Date(`${end}T23:59:00Z`)),
      created_by: retained.id,
    })
    accessRows.push({
      section_id: id,
      start_date: iso(new Date(`${start}T04:00:00Z`)),
      end_date: iso(new Date(`${end}T23:59:00Z`)),
      grace_days: 3,
    })
  }
  await must('insert sections', supabase.from('course_sections').insert(sectionRows))
  await must('insert access windows', supabase.from('access_windows').insert(accessRows))

  const cohortSpecs = [
    ['fybsd-2026', tracks.fybsd, 'First Year Bible Studies Diploma - 2026 Cohort', 'FYBSD-2026', ['student.bible01', 'student.bible02', 'student.bible03', 'student.bible04', 'student.bible05', 'student.bible06', 'student.bible07', 'student.bible08', 'student.bible09', 'student.bible10']],
    ['abs-y2-2026', tracks.associates, 'Associate Degree Year Two - 2026 Cohort', 'ABS-Y2-2026', ['student.assoc01', 'student.assoc02', 'student.assoc03', 'student.assoc04', 'student.assoc05']],
    ['nmd-sep-2026', tracks['new-members'], 'New Members September 2026', 'NMD-SEP-2026', ['member01', 'member02', 'member03', 'member04']],
    ['rbs-wed-2026', tracks['remote-study'], 'Wednesday Remote Bible Study - Gospel of John', 'RBS-WED-2026', ['student.bible01', 'student.bible02', 'student.bible03', 'student.bible04', 'student.bible05', 'student.bible06', 'student.bible07', 'student.bible08', 'student.bible09', 'student.bible10']],
    ['forge-2026', tracks.forge, 'Forge Residency 2026', 'FORGE-2026', ['forge01', 'forge02']],
    ['cld-2026', tracks.leadership, 'Christian Leadership 2026', 'CLD-2026', ['leader01', 'leader02']],
  ]

  const cohorts = Object.fromEntries(cohortSpecs.map(([key]) => [key, uid()]))
  await must('insert cohorts', supabase.from('global_cohorts').insert(cohortSpecs.map(([key, trackId, cohort_name, cohort_code]) => ({
    id: cohorts[key],
    program_track_id: trackId,
    cohort_name,
    cohort_code,
    description: 'Demo cohort generated by scripts/reset-demo-data.mjs',
    created_by: retained.id,
  }))))

  const cohortMembers = []
  for (const [key, , , , prefixes] of cohortSpecs) {
    for (const prefix of prefixes) {
      cohortMembers.push({
        cohort_id: cohorts[key],
        user_id: people.get(`${prefix}@${demoDomain}`).auth_id,
        status: 'active',
      })
    }
  }
  await must('insert cohort members', supabase.from('cohort_members').insert(cohortMembers))

  const cohortSectionLinks = [
    ['fybsd-2026', sectionSpecs.slice(0, 8)],
    ['abs-y2-2026', sectionSpecs.slice(8, 16)],
    ['nmd-sep-2026', sectionSpecs.slice(16, 17)],
    ['rbs-wed-2026', sectionSpecs.slice(17, 18)],
    ['forge-2026', sectionSpecs.slice(18, 19)],
    ['cld-2026', sectionSpecs.slice(19, 20)],
  ]

  const directEnrollments = []
  for (const [cohortKey, specs] of cohortSectionLinks) {
    const members = cohortMembers.filter((member) => member.cohort_id === cohorts[cohortKey])
    for (const [bpKey, , sectionCode] of specs) {
      const section_id = sections[`${bpKey}:${sectionCode}`]
      for (const member of members) {
        directEnrollments.push({
          id: uid(),
          user_id: member.user_id,
          section_id,
          status: 'pending',
          source: 'cohort',
          source_cohort_id: cohorts[cohortKey],
          enrolled_by: retained.id,
        })
      }
    }
  }
  await must('insert direct enrollments', supabase.from('direct_enrollments').insert(directEnrollments))

  const enrollmentRows = []
  for (const de of directEnrollments) {
    const sectionSpec = sectionSpecs.find(([bpKey, , sectionCode]) => sections[`${bpKey}:${sectionCode}`] === de.section_id)
    if (!sectionSpec) continue
    const [bpKey] = sectionSpec
    const profile = [...people.values()].find((p) => p.auth_id === de.user_id)
    if (!profile) continue
    enrollmentRows.push({
      id: uid(),
      user_id: profile.uid,
      course_id: courseByBlueprint[bpKey],
      section_id: de.section_id,
      transit_status: 'in_progress',
      progress_percent: Math.floor(Math.random() * 60) + 15,
      last_accessed_at: iso(new Date()),
    })
  }
  await must('upsert course enrollments', supabase.from('enrollments').upsert(enrollmentRows, { onConflict: 'user_id,course_id' }))

  const courseEnrollmentRows = enrollmentRows.map((row) => ({
    id: uid(),
    course_id: row.course_id,
    user_id: row.user_id,
    role: 'student',
    status: row.transit_status === 'completed' ? 'completed' : 'active',
    source: 'admin',
    enrolled_at: iso(new Date(Date.UTC(2026, 5, 17, 14, 0, 0))),
    last_activity_at: row.last_accessed_at,
    metadata: { demo: true },
  }))
  await must('insert block course enrollments', supabase.from('course_enrollments').insert(courseEnrollmentRows))

  const courseEnrollmentKey = new Map(courseEnrollmentRows.map((row) => [`${row.user_id}:${row.course_id}`, row.id]))
  const completedEnrollmentKeys = new Set()
  const gradedSubmissions = []
  const completedCourseIds = new Set([
    courseByBlueprint['ot-survey'],
    courseByBlueprint['nt-survey'],
    courseByBlueprint['new-members'],
    courseByBlueprint['forge-core'],
    courseByBlueprint['leadership-core'],
  ])

  enrollmentRows.forEach((row, index) => {
    const blocks = assessableBlocksByCourse.get(row.course_id)
    const enrollmentId = courseEnrollmentKey.get(`${row.user_id}:${row.course_id}`)
    if (!blocks || !enrollmentId) return

    const score = 78 + (index % 20)
    gradedSubmissions.push(
      {
        block_id: blocks.assignment,
        enrollment_id: enrollmentId,
        user_id: row.user_id,
        attempt_number: 1,
        status: 'graded',
        content: { text: 'Demo reflection connecting course outcomes to ministry practice.' },
        score,
        max_score: 100,
        feedback: 'Strong demo submission with clear application.',
        graded_by: teacherBible,
        submitted_at: iso(new Date(Date.UTC(2026, 5, 16, 16, 0, 0))),
        graded_at: iso(new Date(Date.UTC(2026, 5, 17, 16, 0, 0))),
      },
      {
        block_id: blocks.quiz,
        enrollment_id: enrollmentId,
        user_id: row.user_id,
        attempt_number: 1,
        status: 'graded',
        content: { answers: [0] },
        score: index % 6 === 0 ? 8 : 10,
        max_score: 10,
        feedback: 'Auto-graded demo knowledge check.',
        graded_by: teacherBible,
        submitted_at: iso(new Date(Date.UTC(2026, 5, 17, 15, 0, 0))),
        graded_at: iso(new Date(Date.UTC(2026, 5, 17, 15, 1, 0))),
      },
    )

    if (completedCourseIds.has(row.course_id) && index % 3 === 0) {
      row.transit_status = 'completed'
      row.progress_percent = 100
      completedEnrollmentKeys.add(`${row.user_id}:${row.course_id}`)
    }
  })

  await must('insert graded submissions', supabase.from('block_submissions').insert(gradedSubmissions))

  const completedRows = enrollmentRows.filter((row) => completedEnrollmentKeys.has(`${row.user_id}:${row.course_id}`))
  if (completedRows.length > 0) {
    await must('mark completed enrollments', supabase.from('enrollments').upsert(completedRows, { onConflict: 'user_id,course_id' }))
    await must('mark completed block enrollments', supabase
      .from('course_enrollments')
      .update({ status: 'completed', completed_at: iso(new Date(Date.UTC(2026, 5, 17, 17, 0, 0))) })
      .in('id', completedRows.map((row) => courseEnrollmentKey.get(`${row.user_id}:${row.course_id}`)).filter(Boolean)))

    const certificateRows = completedRows.map((row, index) => ({
      user_id: row.user_id,
      course_id: row.course_id,
      issued_at: iso(new Date(Date.UTC(2026, 5, 17, 18, index % 50, 0))),
      final_grade: 88 + (index % 10),
      letter_grade: index % 4 === 0 ? 'A' : 'B+',
      total_xp_earned: 100,
      certificate_no: `DEMO-${String(index + 1).padStart(4, '0')}`,
    }))
    await must('insert certificates', supabase.from('course_certificates').insert(certificateRows))
  }

  const managerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  await must('sign in academic manager', managerClient.auth.signInWithPassword({
    email: `manager.academic@${demoDomain}`,
    password,
  }))
  await must('activate direct enrollments', managerClient
    .from('direct_enrollments')
    .update({ status: 'active' })
    .in('id', directEnrollments.map((row) => row.id)))

  const announcements = [
    ['Welcome to the ChurchCore LMS demo', 'This environment shows diploma, associates, discipleship, remote study, Forge, and leadership programs.', 'global', null],
    ['First Year Diploma Launch', 'Your first four 5-week hybrid courses run August through December.', 'course', courseByBlueprint['ot-survey']],
    ['Remote Bible Study Rhythm', 'The Wednesday group is remote and self-paced, with weekly check-ins for one year.', 'course', courseByBlueprint['remote-john']],
  ]
  await must('insert announcements', supabase.from('announcements').insert(announcements.map(([title, body, scope, course_id]) => ({
    created_by: retainedUid,
    title,
    body,
    scope,
    course_id,
    priority: 'normal',
    is_published: true,
    published_at: iso(new Date()),
  }))))

  const calendarEvents = []
  const currentMonthStart = new Date(Date.UTC(2026, 5, 18, 18, 0, 0))
  calendarEvents.push({
    created_by: retainedUid,
    event_type: 'institutional',
    title: 'ChurchCore Demo Academic Showcase',
    description: 'Current-month demo event proving the calendar is wired to the seeded academic data.',
    starts_at: iso(currentMonthStart),
    ends_at: iso(new Date(currentMonthStart.getTime() + 60 * 60 * 1000)),
    timezone: 'America/New_York',
    location: 'Demo campus and livestream',
    color_code: '#7C3AED',
    scope: 'institutional',
  })
  for (let week = 0; week < 4; week++) {
    const start = new Date(Date.UTC(2026, 8, 7 + week * 7, 23, 0, 0))
    const end = new Date(start.getTime() + 90 * 60 * 1000)
    calendarEvents.push({
      created_by: retainedUid,
      course_id: courseByBlueprint['new-members'],
      event_type: 'custom',
      title: `New Members Discipleship Monday ${week + 1}`,
      description: 'In-person plus online discipleship session for new members.',
      starts_at: iso(start),
      ends_at: iso(end),
      timezone: 'America/New_York',
      location: 'Hybrid - Church campus and livestream',
      color_code: '#2563EB',
      scope: 'course',
    })
  }

  for (let week = 0; week < 52; week++) {
    const start = new Date(Date.UTC(2026, 8, 2 + week * 7, 23, 30, 0))
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    calendarEvents.push({
      created_by: retainedUid,
      course_id: courseByBlueprint['remote-john'],
      event_type: 'custom',
      title: `Remote Bible Study Wednesday Check-in ${week + 1}`,
      description: 'Optional remote touchpoint for the self-paced Gospel of John study group.',
      starts_at: iso(start),
      ends_at: iso(end),
      timezone: 'America/New_York',
      location: 'Remote video call',
      color_code: '#059669',
      scope: 'course',
    })
  }

  await must('insert calendar events', supabase.from('calendar_events').insert(calendarEvents))

  await must('insert notifications', supabase.from('notifications').insert([...people.values()].slice(3, 13).map((profile) => ({
    user_id: profile.uid,
    type: 'system',
    title: 'Welcome to your ChurchCore demo pathway',
    body: 'Your cohort enrollment and course sections have been prepared for the demo.',
    is_read: false,
  }))))

  console.log(`
Demo reset complete.

Retained admin: ${retained.email}
Demo password for generated accounts: ${password}

Created:
- 6 program tracks
- 20 course blueprints and linked content courses
- 8 terms/series
- 20 sections with access windows
- ${calendarEvents.length} scheduled calendar events
- 6 cohorts
- 1 demo manager, 3 teachers, and 23 demo learners
- ${directEnrollments.length} direct section enrollments
- ${enrollmentRows.length} course enrollments
- ${gradedSubmissions.length} graded submissions
- ${completedRows.length} certificates
`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
