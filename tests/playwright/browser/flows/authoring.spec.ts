// COUNCIL-2026-031 D4.3 — staff authoring journeys: courses, enrollment,
// block order, content pages, attendance, announcements, calendar.
import type { Page } from '@playwright/test'
import { test, expect, asActor, open } from '../../fixtures/test'
import { covers } from '../../fixtures/covers'
import { BLOCK, COURSE, IDS } from '../../fixtures/data'
import { USERS } from '../../fixtures/roles'
import { db, runTag } from '../../fixtures/db'

test.use(asActor('teacher'))

// Nearest element that contains both a piece of text and a given action label.
function cardWith(page: Page, text: string, action: string) {
  return page.getByText(text, { exact: true })
    .locator(`xpath=ancestor::*[.//*[normalize-space(text())="${action}"]][1]`)
}

test('creates a draft course', async ({ page }) => {
  covers('action:courses.createCourse')
  const title = `${runTag()} Course`
  await open(page, '/courses/new')
  await page.getByPlaceholder(/Introduction to Bibl/).fill(title)
  await page.getByRole('button', { name: 'Create Course' }).click()
  await expect(page).not.toHaveURL(/\/courses\/new$/)
  const { data } = await db().from('courses').select('id, org_id, owner_id, status').eq('title', title).single()
  expect(data).toMatchObject({ org_id: USERS.teacher.org, owner_id: USERS.teacher.uid })
  await db().from('courses').delete().eq('id', data!.id)
})

test('enrolls and unenrolls a learner', async ({ page }) => {
  covers('action:enrollment.staffEnroll', 'action:enrollment.staffUnenroll')
  const target = USERS.platform.uid // org-A account with the student role, not enrolled in Course A
  // staff_enroll_student / staff_unenroll_student manage the `enrollments` progress row.
  await db().from('enrollments').delete().eq('course_id', COURSE.a).eq('user_id', target)
  const enrolled = async () => (await db().from('enrollments').select('transit_status')
    .eq('course_id', COURSE.a).eq('user_id', target).maybeSingle()).data?.transit_status ?? null

  await open(page, `/courses/${COURSE.a}/enroll`)
  const row = page.getByRole('row', { name: /Test Platform Admin/ })
  await row.getByRole('button', { name: 'Enroll' }).click()
  await expect.poll(enrolled).toBe('not_started')
  await row.getByRole('button', { name: 'Unenroll' }).click()
  await expect.poll(enrolled).toBeNull()
})

test('reorders course blocks in the builder', async ({ page }) => {
  covers('action:learning.reorderCourseBlocks')
  const order = async () => (await db().from('course_blocks').select('id')
    .eq('course_id', COURSE.a).is('parent_block_id', null).order('sort_order')).data?.map((b) => b.id) ?? []
  await open(page, `/courses/${COURSE.a}/build`)
  const before = await page.getByRole('button', { name: '▼' }).count()
  expect(before).toBeGreaterThan(1)
  const snapshot = (await db().from('course_blocks').select('id, sort_order').eq('course_id', COURSE.a)).data ?? []
  await page.getByRole('button', { name: '▼' }).nth(1).click()
  await expect.poll(async () => JSON.stringify((await db().from('course_blocks').select('id, sort_order')
    .eq('course_id', COURSE.a).order('id')).data)).not.toBe(JSON.stringify([...snapshot].sort((a, b) => a.id.localeCompare(b.id))))
  void order
})

test('writes, publishes, unpublishes and archives a content page', async ({ page }) => {
  covers(
    'action:content.createPageAndRedirect', 'action:content.createPage', 'action:content.updatePageTitle',
    'action:content.updatePageContent', 'action:content.publishPage', 'action:embedding.generatePageEmbedding',
    'action:content.unpublishPage', 'action:content.deletePage',
  )
  const title = `${runTag()} Material`
  await open(page, `/courses/${COURSE.a}/pages`)
  await page.getByRole('button', { name: '+ New Material' }).click()
  await expect(page).toHaveURL(/\/pages\/[0-9a-f-]{36}\/edit$/)
  const pageId = page.url().match(/pages\/([0-9a-f-]{36})\/edit/)![1]
  const row = async () => (await db().from('content_pages').select('title, status, body_text').eq('id', pageId).single()).data

  await page.getByPlaceholder('Page title…').fill(title)
  await page.getByPlaceholder('Page title…').blur()
  await expect.poll(async () => (await row())?.title).toBe(title)

  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Suite material body text.')
  await expect.poll(async () => (await row())?.body_text ?? '', { timeout: 15_000 }).toContain('Suite material body text.')

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect.poll(async () => (await row())?.status).toBe('published')
  await page.getByRole('button', { name: 'Unpublish' }).click()
  await expect.poll(async () => (await row())?.status).toBe('draft')

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Archive' }).click()
  await expect.poll(async () => (await row())?.status).toBe('archived')
})

test('records attendance for a learner', async ({ page }) => {
  covers('action:attendance.markStudentAttendance')
  await db().from('block_submissions').delete().eq('block_id', BLOCK.attendance).eq('user_id', USERS.student.uid)
  await open(page, `/courses/${COURSE.a}/attendance`)
  await expect(page.getByText('Test Student A')).toBeVisible()
  await page.getByRole('button', { name: /Mark/ }).first().click()
  await page.getByRole('button', { name: /Present/ }).first().click()
  await expect.poll(async () => (await db().from('block_submissions').select('content, graded_by')
    .eq('block_id', BLOCK.attendance).eq('user_id', USERS.student.uid).maybeSingle()).data)
    .toMatchObject({ content: { attendance_status: 'present' }, graded_by: USERS.teacher.uid })
})

test('drafts, then publishes, an announcement; a learner marks it read', async ({ browser }) => {
  const admin = await browser.newContext(asActor('admin'))
  const page = await admin.newPage()
  covers('action:announcements.createAnnouncement', 'action:announcements.publishAnnouncement', 'action:announcements.markAnnouncementRead')
  const title = `${runTag()} Announcement`
  await open(page, '/announcements/new')
  await page.getByPlaceholder('Announcement title…').fill(title)
  await page.getByPlaceholder('Write your announcement…').fill('Suite announcement body.')
  await page.getByRole('button', { name: 'Save Draft' }).click()
  const find = async () => (await db().from('announcements').select('id, is_published').eq('title', title).maybeSingle()).data
  await expect.poll(async () => (await find())?.is_published).toBe(false)

  await open(page, '/announcements')
  await cardWith(page, title, 'Publish').getByRole('button', { name: 'Publish', exact: true }).click()
  await expect.poll(async () => (await find())?.is_published).toBe(true)

  const learner = await browser.newContext(asActor('student'))
  const lp = await learner.newPage()
  await open(lp, '/announcements')
  await cardWith(lp, title, 'Mark read').getByText('Mark read', { exact: true }).click()
  const id = (await find())!.id
  await expect.poll(async () => (await db().from('announcement_reads').select('announcement_id')
    .eq('announcement_id', id).eq('user_id', USERS.student.uid).maybeSingle()).data).toBeTruthy()
  await learner.close()
  await admin.close()
})

test('a manager posts an org-wide announcement', async ({ browser }) => {
  const manager = await browser.newContext(asActor('manager'))
  const page = await manager.newPage()
  covers('action:announcements.createAnnouncement', 'page:/announcements/new')
  const title = `${runTag()} Manager announcement`
  await open(page, '/announcements/new')
  await page.getByPlaceholder('Announcement title…').fill(title)
  await page.getByPlaceholder('Write your announcement…').fill('Org-wide from a manager.')
  await page.getByRole('button', { name: 'Save Draft' }).click()
  await expect.poll(async () => (await db().from('announcements').select('scope').eq('title', title).maybeSingle()).data)
    .toMatchObject({ scope: 'global' })
  await manager.close()
})

test('creates an institutional calendar event', async ({ page }) => {
  covers('action:announcements.createCalendarEvent')
  const title = `${runTag()} Event`
  await open(page, '/calendar/new')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Starts').fill('2030-01-15T10:00')
  await page.getByLabel('Scope').selectOption('institutional')
  await page.getByRole('button', { name: 'Create Event' }).click()
  await expect.poll(async () => (await db().from('calendar_events').select('scope, org_id').eq('title', title).maybeSingle()).data)
    .toMatchObject({ scope: 'institutional', org_id: USERS.teacher.org })
})

test.describe('a learner', () => {
  test.use(asActor('student'))
  test('creates a personal calendar event', async ({ page }) => {
    const title = `${runTag()} Personal`
    await open(page, '/calendar/new')
    await page.getByLabel('Title').fill(title)
    await page.getByLabel('Starts').fill('2030-02-01T09:00')
    await expect(page.getByLabel('Scope').locator('option[value="institutional"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Create Event' }).click()
    await expect.poll(async () => (await db().from('calendar_events').select('scope, user_id').eq('title', title).maybeSingle()).data)
      .toMatchObject({ scope: 'personal', user_id: USERS.student.uid })
  })
})

void IDS
