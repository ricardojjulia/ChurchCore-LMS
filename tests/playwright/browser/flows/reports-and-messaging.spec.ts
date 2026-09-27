// COUNCIL-2026-031 D4.3 — report exports, report history, and starting a
// direct message (user search).
import { test, expect, asActor, open } from '../../fixtures/test'
import { covers } from '../../fixtures/covers'
import { COURSE } from '../../fixtures/data'
import { USERS } from '../../fixtures/roles'
import { db } from '../../fixtures/db'

test.describe('student reports', () => {
  test.use(asActor('student'))

  test('exports progress as XLSX', async ({ page }) => {
    covers('action:(reports)/student/reports/actions.generateStudentXLSXExport')
    await open(page, '/student/reports')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export XLSX' }).click()
    expect((await download).suggestedFilename()).toMatch(/\.xlsx$/)
  })

  test('exports progress as PDF', async ({ page }) => {
    covers('action:(reports)/student/reports/actions.generateStudentProgressReport')
    await open(page, '/student/reports')
    const download = page.waitForEvent('download', { timeout: 15_000 })
    await page.getByRole('button', { name: 'Export PDF' }).click()
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
  })

  test('clears completed reports from the history drawer', async ({ page }) => {
    covers('action:(reports)/reports-drawer-actions.clearCompletedReportArtifacts')
    await db().from('report_artifacts').insert({
      org_id: USERS.student.org, generated_by: USERS.student.uid, format: 'xlsx',
      generation_status: 'complete', retention_class: 'ferpa', row_count: 1,
      // "Clear completed" only removes completed reports older than 7 days.
      generated_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    const completed = async () => (await db().from('report_artifacts').select('id', { count: 'exact', head: true })
      .eq('generated_by', USERS.student.uid).eq('generation_status', 'complete')).count ?? 0
    expect(await completed()).toBeGreaterThan(0)
    await open(page, '/student/reports')
    await page.getByRole('button', { name: 'Your Reports' }).click()
    page.on('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Clear completed' }).click()
    await expect.poll(completed).toBe(0)
  })
})

test.describe('instructor gradebook reports', () => {
  test.use(asActor('teacher'))

  test('exports a course gradebook as XLSX', async ({ page }) => {
    covers('action:(reports)/instructor/reports/actions.generateGradebookXLSXExport')
    await open(page, `/instructor/reports?course=${COURSE.a}`)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export XLSX' }).click()
    expect((await download).suggestedFilename()).toMatch(/\.xlsx$/)
  })

  test('exports a course gradebook as PDF', async ({ page }) => {
    covers('action:(reports)/instructor/reports/actions.generateGradebookPDFExport')
    await open(page, `/instructor/reports?course=${COURSE.a}`)
    const download = page.waitForEvent('download', { timeout: 15_000 })
    await page.getByRole('button', { name: 'Export PDF' }).click()
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
  })
})

test.describe('messaging', () => {
  test.use(asActor('teacher'))

  test('finds a person and opens a direct thread', async ({ page }) => {
    covers('action:messages.searchUsers')
    await open(page, '/messages')
    await page.getByRole('button', { name: '+ New Message' }).click()
    await page.getByPlaceholder('Search by name or email…').fill('Test Manager')
    await page.getByText('Test Manager A').first().click()
    await page.getByPlaceholder('Write your message…').fill('Hello from the suite.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/)
    await expect(page.getByText('Hello from the suite.').first()).toBeVisible()
  })
})

test.describe('teacher ↔ guardian messaging (COUNCIL-2026-035)', () => {
  test.describe.configure({ mode: 'serial' })
  const threadAbout = async () => (await db().from('message_threads').select('id, subject')
    .eq('subject_student_uid', USERS.student.uid)).data ?? []

  test.beforeAll(async () => {
    const ids = (await threadAbout()).map((t) => t.id)
    if (ids.length) await db().from('message_threads').delete().in('id', ids)
    await db().from('guardian_notification_queue').delete().eq('student_uid', USERS.student.uid).eq('event_type', 'message_received')
  })

  test.describe('a guardian', () => {
    test.use(asActor('guardian'))
    test('messages their child\'s teacher from the guardian page', async ({ page }) => {
      covers('action:messages.getOrCreateGuardianThread')
      await open(page, `/guardian/${USERS.student.uid}`)
      await page.getByRole('button', { name: /Message Test Teacher A/ }).first().click()
      await page.getByLabel('Message to Test Teacher A').fill('How is she doing in class?')
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}/)
      await expect(page.getByText('How is she doing in class?')).toBeVisible()
      const threads = await threadAbout()
      expect(threads).toHaveLength(1)
      expect(threads[0].subject).toBe('About Test Student A')
    })
  })

  test.describe('the teacher', () => {
    test.use(asActor('teacher'))
    test('replies from the gradebook; the guardian email carries no message body', async ({ page }) => {
      await open(page, `/courses/${COURSE.a}/gradebook`)
      await page.getByRole('button', { name: 'Message guardian Test Guardian A' }).first().click()
      await page.getByLabel('Message to Test Guardian A').fill('She is doing great.')
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}/)
      // Reuses the existing thread about the student rather than opening a new one.
      expect(await threadAbout()).toHaveLength(1)
      const { data: queued } = await db().from('guardian_notification_queue')
        .select('payload').eq('student_uid', USERS.student.uid).eq('event_type', 'message_received')
      expect(queued).toHaveLength(1)
      expect(queued![0].payload).toMatchObject({ recipient_guardian_uid: USERS.guardian.uid })
      expect(JSON.stringify(queued![0].payload)).not.toContain('She is doing great')
    })
  })

  test('denied pairs: an unlinked guardian and an unrelated teacher get no way to message', async ({ browser }) => {
    const { randomUUID } = await import('node:crypto')
    const make = async (role: string) => {
      const email = `suite-msg-${role}-${Date.now().toString(36)}@test.churchcore.dev`
      const password = `P-${randomUUID()}`
      const { data } = await db().auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { display_name: `Suite ${role}` },
        app_metadata: { org_id: USERS.teacher.org, role },
      })
      return { id: data.user!.id, email, password }
    }
    const signIn = async (email: string, password: string) => {
      const ctx = await browser.newContext(asActor('anon'))
      const page = await ctx.newPage()
      await page.goto('/login')
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill(password)
      await page.getByRole('button', { name: /Sign in/i }).click()
      await page.waitForURL(/\/dashboard/)
      return page
    }

    // A guardian who isn't linked to the student can't open the student's page.
    const guardian = await make('guardian')
    const gp = await signIn(guardian.email, guardian.password)
    await gp.goto(`/guardian/${USERS.student.uid}`)
    await expect(gp.getByRole('button', { name: /^Message / })).toHaveCount(0)
    await gp.context().close()

    // A teacher who doesn't teach the student can't reach the course gradebook.
    const teacher = await make('teacher')
    const tp = await signIn(teacher.email, teacher.password)
    await tp.goto(`/courses/${COURSE.a}/gradebook`)
    await expect(tp.getByRole('button', { name: /Message guardian/ })).toHaveCount(0)
    await tp.context().close()

    for (const u of [guardian, teacher]) await db().auth.admin.deleteUser(u.id)
  })
})
