// COUNCIL-2026-031 D4.3 — org administration: academic structure, users,
// badges, question banks, org settings. Every change is asserted in the
// database; anything created is uniquely named and cleaned up.
import type { Page } from '@playwright/test'
import { test, expect, asActor, open } from '../../fixtures/test'
import { covers } from '../../fixtures/covers'
import { COURSE, IDS, ORG_A } from '../../fixtures/data'
import { db, runTag } from '../../fixtures/db'

test.use(asActor('admin'))

const shortCode = () => `S${Date.now().toString(36).toUpperCase().slice(-6)}`

test.describe('academic structure', () => {
  test('creates and edits a term', async ({ page }) => {
    covers('action:academic.createTerm', 'action:academic.updateTerm')
    const name = `${runTag()} Term`
    const code = shortCode()
    await open(page, '/admin/terms/new')
    await page.getByLabel('Name *').fill(name)
    await page.getByLabel('Code *').fill(code)
    await page.getByLabel('Type *').selectOption('semester')
    await page.getByLabel('Start Date *').fill('2031-01-01')
    await page.getByLabel('End Date *').fill('2031-05-31')
    await page.getByRole('button', { name: 'Create Term' }).click()
    const term = async () => (await db().from('academic_terms').select('id, term_name, org_id').eq('term_code', code).maybeSingle()).data
    await expect.poll(async () => (await term())?.org_id).toBe(ORG_A)

    await open(page, `/admin/terms/${(await term())!.id}`)
    await page.getByLabel('Name *').fill(`${name} (edited)`)
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect.poll(async () => (await term())?.term_name).toBe(`${name} (edited)`)
    await db().from('academic_terms').delete().eq('term_code', code)
  })

  test('creates a blueprint and a section, then edits both', async ({ page }) => {
    covers('action:academic.createBlueprint', 'action:academic.updateBlueprint',
      'action:academic.createSection', 'action:academic.updateSectionEnrollmentType')
    const code = shortCode()
    await open(page, '/admin/blueprints/new')
    await page.getByLabel('Course Code *').fill(code)
    await page.getByLabel('Title *').fill(`${runTag()} Blueprint`)
    await page.getByRole('button', { name: 'Create Blueprint' }).click()
    const bp = async () => (await db().from('course_blueprints').select('id, title, org_id').eq('course_code', code).maybeSingle()).data
    await expect.poll(async () => (await bp())?.org_id).toBe(ORG_A)
    const bpId = (await bp())!.id

    await open(page, `/admin/blueprints/${bpId}`)
    await page.getByLabel('Title *').fill('Suite Blueprint (edited)')
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect.poll(async () => (await bp())?.title).toBe('Suite Blueprint (edited)')

    const sectionCode = shortCode()
    await open(page, '/admin/sections/new')
    await page.getByLabel('Blueprint *').selectOption(bpId)
    await page.getByLabel('Term *').selectOption(IDS.term)
    await page.getByLabel('Section Code *').fill(sectionCode)
    await page.getByLabel('Delivery Format *').selectOption('self_paced')
    await page.getByLabel('Enrollment Type *').selectOption('open')
    await page.getByRole('button', { name: 'Create Section' }).click()
    const section = async () => (await db().from('course_sections').select('id, enrollment_type')
      .eq('section_code', sectionCode).maybeSingle()).data
    await expect.poll(async () => (await section())?.enrollment_type).toBe('open')

    await open(page, `/admin/sections/${(await section())!.id}`)
    await page.getByLabel('Enrollment Type').selectOption('invite_only')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.poll(async () => (await section())?.enrollment_type).toBe('invite_only')

    await db().from('course_sections').delete().eq('section_code', sectionCode)
    await db().from('course_blueprints').delete().eq('id', bpId)
  })

  test('adds and removes a program-track course', async ({ page }) => {
    covers('action:program-tracks.addCourseToTrack', 'action:program-tracks.removeCourseFromTrack')
    const linked = async () => (await db().from('program_track_courses').select('course_id')
      .eq('track_id', IDS.programTrack).eq('course_id', COURSE.standalone).maybeSingle()).data
    await db().from('program_track_courses').delete().eq('track_id', IDS.programTrack).eq('course_id', COURSE.standalone)
    await open(page, `/admin/program-tracks/${IDS.programTrack}`)
    await page.locator('#ptc-course').selectOption(COURSE.standalone)
    await page.getByRole('button', { name: 'Add Course' }).click()
    await expect.poll(linked).toBeTruthy()
    await open(page, `/admin/program-tracks/${IDS.programTrack}`)
    await page.getByRole('row', { name: /Standalone Course/ }).getByRole('button', { name: 'Remove' }).click()
    await expect.poll(linked).toBeNull()
  })

  test('creates a cohort, lists its members, and queues a bulk-enrollment preview', async ({ page }) => {
    covers('action:cohorts.createCohort', 'action:cohorts.startBulkEnrollment')
    const code = shortCode()
    await open(page, '/admin/cohorts/new')
    await page.getByLabel('Cohort Name *').fill(`${runTag()} Cohort`)
    await page.getByLabel('Code *').fill(code)
    await page.getByRole('button', { name: 'Create Cohort' }).click()
    await expect.poll(async () => (await db().from('global_cohorts').select('org_id').eq('cohort_code', code).maybeSingle()).data?.org_id)
      .toBe(ORG_A)
    await db().from('global_cohorts').delete().eq('cohort_code', code)

    // The seeded cohort has one member; the page must show them (it used to
    // embed auth.users, which PostgREST cannot do, and always showed none).
    await open(page, `/admin/cohorts/${IDS.cohort}`)
    await expect(page.getByText('student@test.churchcore.dev').first()).toBeVisible()

    await open(page, `/admin/cohorts/${IDS.cohort}/enroll`)
    await page.getByLabel('Target Section *').selectOption(IDS.section)
    await page.getByRole('button', { name: 'Preview Enrollment' }).click()
    await expect.poll(async () => (await db().from('enrollment_jobs').select('dry_run')
      .eq('cohort_id', IDS.cohort).order('created_at', { ascending: false }).limit(1).maybeSingle()).data?.dry_run)
      .toBe(true)
  })
})

async function tempUser(role: 'student' | 'teacher') {
  const email = `suite-${Date.now().toString(36)}@test.churchcore.dev`
  const { data, error } = await db().auth.admin.createUser({
    email, password: `P-${Math.random()}`, email_confirm: true,
    user_metadata: { display_name: `Suite Temp ${role}` },
    app_metadata: { org_id: ORG_A, role }, // role/org are only trusted from app_metadata
  })
  if (error) throw error
  await expect.poll(async () => (await db().from('profiles').select('uid').eq('auth_id', data.user.id).maybeSingle()).data?.uid).toBeTruthy()
  return { email, authId: data.user.id }
}

async function openUserDrawer(page: Page, email: string) {
  await open(page, '/admin/users')
  await page.getByRole('button', { name: new RegExp(email.replace('.', '\\.')) }).click()
}

test.describe('users', () => {
  test('changes a user role and status, then deletes the user', async ({ page }) => {
    covers('action:admin.updateUserRole', 'action:admin.updateUserStatus', 'action:admin.deleteUser')
    const user = await tempUser('student')
    const profile = async () => (await db().from('profiles').select('role, status').eq('auth_id', user.authId).maybeSingle()).data

    await openUserDrawer(page, user.email)
    await page.getByRole('button', { name: 'teacher', exact: true }).last().click() // first match is the role filter chip
    await expect.poll(async () => (await profile())?.role).toBe('teacher')
    await page.getByRole('button', { name: 'suspended', exact: true }).click()
    await expect.poll(async () => (await profile())?.status).toBe('suspended')

    await page.getByRole('button', { name: 'Delete user' }).click()
    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await expect.poll(async () => (await db().auth.admin.getUserById(user.authId)).data.user ?? null).toBeNull()
  })

  test('invites a user by email', async ({ page }) => {
    covers('action:admin.inviteUser')
    const email = `suite-invite-${Date.now().toString(36)}@test.churchcore.dev`
    await open(page, '/admin/users')
    await page.getByRole('button', { name: '+ Invite User' }).click()
    await page.getByPlaceholder('user@example.com').fill(email)
    await page.getByRole('button', { name: 'Send Invitation' }).click()
    const invited = async () => (await db().auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === email)
    await expect.poll(async () => (await invited())?.email).toBe(email)
    await db().auth.admin.deleteUser((await invited())!.id)
  })

  test('imports users from CSV', async ({ page }) => {
    covers('action:admin.bulkInviteUsers')
    const email = `suite-bulk-${Date.now().toString(36)}@test.churchcore.dev`
    await open(page, '/admin/users/import')
    await page.locator('#csv-file-input').setInputFiles({
      name: 'users.csv', mimeType: 'text/csv',
      buffer: Buffer.from(`email,display_name,role\n${email},Suite Bulk,student\n`),
    })
    await page.getByRole('button', { name: /Import|Invite/ }).first().click()
    const created = async () => (await db().auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === email)
    await expect.poll(async () => (await created())?.email, { timeout: 20_000 }).toBe(email)
    await db().auth.admin.deleteUser((await created())!.id)
  })
})

test.describe('badges and question banks', () => {
  test('creates, edits and deletes a badge', async ({ page }) => {
    covers('action:admin.upsertBadge', 'action:admin.deleteBadge')
    const title = `${runTag()} Badge`
    await open(page, '/admin/badges')
    await page.getByRole('button', { name: '+ New Badge' }).click()
    await page.getByPlaceholder('e.g. First Steps').fill(title)
    await page.getByPlaceholder(/What this badge represent/).fill('Suite badge description.')
    await page.getByRole('button', { name: 'Create Badge' }).click()
    const badge = async () => (await db().from('badges').select('id, description').eq('title', title).maybeSingle()).data
    await expect.poll(async () => (await badge())?.description).toBe('Suite badge description.')

    const row = page.getByText(title, { exact: true }).locator('xpath=ancestor::*[.//button[normalize-space()="Edit"]][1]')
    await row.getByRole('button', { name: 'Edit' }).click()
    await page.getByPlaceholder(/What this badge represent/).fill('Edited description.')
    await page.getByRole('button', { name: /Save|Update/ }).first().click()
    await expect.poll(async () => (await badge())?.description).toBe('Edited description.')

    page.once('dialog', (d) => d.accept())
    await row.getByRole('button', { name: 'Delete' }).click()
    await expect.poll(badge).toBeNull()
  })

  test('manages a question bank and its questions', async ({ page }) => {
    covers('action:admin.upsertQuestionBank', 'action:admin.addBankQuestion',
      'action:admin.deleteBankQuestion', 'action:admin.deleteQuestionBank')
    page.on('dialog', (d) => d.accept())
    const name = `${runTag()} Bank`
    await open(page, '/admin/question-banks/new')
    await page.getByLabel('Name *').fill(name)
    await page.getByRole('button', { name: 'Create Bank' }).click()
    const bank = async () => (await db().from('question_banks').select('id, description').eq('name', name).maybeSingle()).data
    await expect.poll(async () => (await bank())?.id).toBeTruthy()
    const bankId = (await bank())!.id

    await open(page, `/admin/question-banks/${bankId}`)
    await page.getByPlaceholder(/Optional description of t/).fill('Suite bank description.')
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect.poll(async () => (await bank())?.description).toBe('Suite bank description.')

    await page.getByRole('button', { name: '+ Add Question' }).click()
    await page.getByPlaceholder('Question text…').fill('Suite bank question?')
    await page.getByPlaceholder('Option 1').fill('Yes')
    await page.getByPlaceholder('Option 2').fill('No')
    await page.getByLabel('Mark option 1 as correct').check()
    await page.getByRole('button', { name: 'Add to Bank' }).click()
    const questions = async () => (await db().from('bank_questions').select('id').eq('bank_id', bankId)).data?.length ?? 0
    await expect.poll(questions).toBe(1)

    await page.locator('button', { hasText: '✕' }).first().click()
    await expect.poll(questions).toBe(0)

    await open(page, '/admin/question-banks')
    await page.getByText(name, { exact: true }).locator('xpath=ancestor::*[.//button[normalize-space()="Delete"]][1]')
      .getByRole('button', { name: 'Delete' }).click()
    await expect.poll(bank).toBeNull()
  })
})

test('saves org branding', async ({ page }) => {
  covers('action:org-settings.updateOrgBranding')
  const before = (await db().from('organizations').select('settings').eq('id', ORG_A).single()).data!.settings
  await open(page, '/admin/settings')
  await page.getByLabel('Email from name').fill('Suite Church Learning')
  await page.getByRole('button', { name: 'Save Branding' }).click()
  await expect.poll(async () => ((await db().from('organizations').select('settings').eq('id', ORG_A).single()).data!
    .settings as { branding?: { email_from_name?: string } }).branding?.email_from_name).toBe('Suite Church Learning')
  await db().from('organizations').update({ settings: before }).eq('id', ORG_A)
})
