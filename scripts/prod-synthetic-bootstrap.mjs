#!/usr/bin/env node
// COUNCIL-2026-031 D8 — one-time (idempotent) setup of the production
// synthetic-QA tenant used by the post-release suite.
//
// Run ONCE, locally, by the owner, from their own shell. The service-role key
// is read from the environment and never stored anywhere:
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
//   SYNTHETIC_PASSWORD=<password> \
//   node scripts/prod-synthetic-bootstrap.mjs --yes
//
// SYNTHETIC_PASSWORD is required: generate one yourself (for example
// `openssl rand -base64 24`), pass it here, and store the same value as the
// GitHub repository secret SYNTHETIC_PASSWORD (see docs/testing.md). The script
// never prints it.
//
// Creates / refreshes:
//   org        slug synthetic-qa, "ChurchCore Synthetic QA", is_synthetic = true
//   accounts   {admin,manager,teacher,student,guardian}@synthetic.churchcore.invalid
//              (.invalid is undeliverable by definition; the app also refuses
//              to email it)
//   content    one published course (module, lesson page, quiz), the student
//              enrolled, and the guardian linked to the student
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || !process.env.SYNTHETIC_PASSWORD) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service role) and SYNTHETIC_PASSWORD in your shell.')
  process.exit(1)
}
if (!process.argv.includes('--yes')) {
  console.error(`This will create/refresh the synthetic-qa tenant in ${new URL(url).host}. Re-run with --yes.`)
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const DOMAIN = 'synthetic.churchcore.invalid'
const ROLES = ['admin', 'manager', 'teacher', 'student', 'guardian']
const password = process.env.SYNTHETIC_PASSWORD
if (password.length < 16) {
  console.error('SYNTHETIC_PASSWORD must be at least 16 characters.')
  process.exit(1)
}

function must(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  return result.data
}

// ── Org ──────────────────────────────────────────────────────────────────────
let org = must(await db.from('organizations').select('id').eq('slug', 'synthetic-qa').maybeSingle(), 'find org')
if (!org) {
  org = must(await db.from('organizations').insert({
    name: 'ChurchCore Synthetic QA', slug: 'synthetic-qa', status: 'active', plan: 'free', is_synthetic: true,
    settings: { features: { ai_tutor: false, guardian_portal: true, leaderboard: true, hq: true, reporting: true } },
  }).select('id').single(), 'create org')
} else {
  must(await db.from('organizations').update({ status: 'active', is_synthetic: true, deleted_at: null }).eq('id', org.id), 'refresh org')
}
const orgId = org.id

// ── Accounts ─────────────────────────────────────────────────────────────────
// Page through every auth user: a truncated list would miss existing
// synthetic accounts and createUser would then fail on the duplicate email.
const allUsers = []
for (let page = 1; ; page++) {
  const { users } = must(await db.auth.admin.listUsers({ page, perPage: 1000 }), 'list users')
  allUsers.push(...users)
  if (users.length < 1000) break
}
const uidByRole = {}
for (const role of ROLES) {
  const email = `${role}@${DOMAIN}`
  const existing = allUsers.find((u) => u.email === email)
  const attrs = {
    password, email_confirm: true,
    user_metadata: { display_name: `Synthetic ${role[0].toUpperCase()}${role.slice(1)}` },
    app_metadata: { org_id: orgId, role },
  }
  const user = existing
    ? must(await db.auth.admin.updateUserById(existing.id, attrs), `update ${email}`).user
    : must(await db.auth.admin.createUser({ email, ...attrs }), `create ${email}`).user
  // app_metadata is synced to the profile by trigger; set it directly as well.
  must(await db.from('profiles').update({ org_id: orgId, role, status: 'active' }).eq('auth_id', user.id), `profile ${email}`)
  uidByRole[role] = must(await db.from('profiles').select('uid').eq('auth_id', user.id).single(), `uid ${email}`).uid
}

// ── Content ──────────────────────────────────────────────────────────────────
let course = must(await db.from('courses').select('id').eq('org_id', orgId).eq('title', 'Synthetic QA Course').maybeSingle(), 'find course')
if (!course) {
  course = must(await db.from('courses').insert({
    org_id: orgId, title: 'Synthetic QA Course', description: 'Used by the post-release checks. Do not edit.',
    status: 'published', owner_id: uidByRole.teacher,
  }).select('id').single(), 'create course')
  const moduleRow = must(await db.from('course_blocks').insert({
    course_id: course.id, org_id: orgId, block_type_id: 'module_header', title: 'Synthetic Module', sort_order: 1, is_published: true, content: {},
  }).select('id').single(), 'create module')
  must(await db.from('course_blocks').insert([
    { course_id: course.id, org_id: orgId, parent_block_id: moduleRow.id, block_type_id: 'page', title: 'Synthetic Lesson',
      sort_order: 2, is_published: true, content: { body: '<p>Synthetic lesson content.</p>' } },
    { course_id: course.id, org_id: orgId, parent_block_id: moduleRow.id, block_type_id: 'quiz', title: 'Synthetic Quiz',
      sort_order: 3, is_published: true, content: { questions: [
        { id: 'sq1', text: 'Synthetic check: pick Yes', type: 'multiple_choice', options: ['Yes', 'No'], correct_index: 0, points: 1 },
      ] } },
  ]), 'create blocks')
}
must(await db.from('course_enrollments').upsert({
  course_id: course.id, user_id: uidByRole.student, role: 'student', status: 'active', source: 'admin', org_id: orgId,
}, { onConflict: 'course_id,user_id,role' }), 'enroll student')
must(await db.from('enrollments').upsert({
  course_id: course.id, user_id: uidByRole.student, transit_status: 'in_progress', progress_percent: 0, org_id: orgId,
}, { onConflict: 'user_id,course_id' }), 'progress row')
const link = must(await db.from('guardian_links').select('id')
  .eq('guardian_uid', uidByRole.guardian).eq('student_uid', uidByRole.student).maybeSingle(), 'find guardian link')
if (!link) {
  must(await db.from('guardian_links').insert({
    guardian_uid: uidByRole.guardian, student_uid: uidByRole.student, created_by: uidByRole.admin, org_id: orgId,
  }), 'link guardian')
}

console.log(`Synthetic tenant ready in ${new URL(url).host}: org ${orgId}, course ${course.id}`)
console.log(`Accounts: ${ROLES.map((r) => `${r}@${DOMAIN}`).join(', ')}`)
console.log('Password: the SYNTHETIC_PASSWORD you supplied (not printed). Store it as the GitHub repository secret.')
