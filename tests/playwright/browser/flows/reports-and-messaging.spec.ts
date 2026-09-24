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
