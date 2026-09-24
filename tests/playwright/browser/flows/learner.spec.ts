// COUNCIL-2026-031 D4.3 — the learner journey through a course, as the
// seeded student, asserting what each step persisted.
import { test, expect, asActor, open } from '../../fixtures/test'
import { covers } from '../../fixtures/covers'
import { BLOCK, COURSE } from '../../fixtures/data'
import { USERS } from '../../fixtures/roles'
import { db } from '../../fixtures/db'

test.use(asActor('student'))
test.describe.configure({ mode: 'serial' })

const LEARN = `/courses/${COURSE.a}/learn`
const student = USERS.student.uid

async function submissionFor(blockId: string) {
  const { data } = await db().from('block_submissions')
    .select('status, score, max_score, grade_pct, content')
    .eq('block_id', blockId).eq('user_id', student)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

test.beforeAll(async () => {
  // Start from a clean slate for this student's work on the suite blocks.
  await db().from('block_submissions').delete().eq('user_id', student)
    .in('block_id', [BLOCK.assignment, BLOCK.quiz, BLOCK.bankQuiz, BLOCK.video, BLOCK.attendance, BLOCK.discussion])
})

test('opens a lesson page and it counts as viewed', async ({ page }) => {
  covers('action:learning.markBlockViewed')
  await open(page, LEARN)
  await page.getByRole('button', { name: /Suite Lesson Page/ }).click()
  await expect(page.getByText('Welcome to the suite lesson.').first()).toBeVisible()
  await expect.poll(async () => {
    const { data } = await db().from('enrollments').select('last_accessed_at, progress_percent')
      .eq('user_id', student).eq('course_id', COURSE.a).single()
    return data?.last_accessed_at ? Date.now() - Date.parse(data.last_accessed_at) : Infinity
  }, { timeout: 10_000 }).toBeLessThan(120_000)
})

test('submits a written assignment', async ({ page }) => {
  covers('action:learning.submitAssignment')
  await open(page, LEARN)
  await page.getByRole('button', { name: /Suite Assignment/ }).first().click()
  await page.getByLabel('Assignment response').fill('The lesson was about welcome and belonging.')
  await page.getByRole('button', { name: 'Submit Assignment' }).click()
  await expect(page.getByText(/Submitted — awaiting instructor grade/)).toBeVisible()
  await expect.poll(async () => (await submissionFor(BLOCK.assignment))?.status).toBe('submitted')
})

test('takes and passes the auto-graded quiz', async ({ page }) => {
  covers('action:learning.submitQuiz')
  await open(page, LEARN)
  await page.getByRole('button', { name: /Suite Quiz/ }).first().click()
  await page.getByRole('radiogroup').nth(0).getByRole('radio', { name: /Alpha/ }).click()
  await page.getByRole('radiogroup').nth(1).getByRole('radio', { name: /True/ }).click()
  await page.getByRole('button', { name: /Submit Quiz \(2\/2 answered\)/ }).click()
  await expect(page.getByText('100%').first()).toBeVisible()
  await expect.poll(async () => Number((await submissionFor(BLOCK.quiz))?.grade_pct)).toBe(100)
})

test('bank-drawn quiz loads its questions from the question bank', async ({ page }) => {
  covers('action:learning.loadQuizQuestions')
  await open(page, LEARN)
  await page.getByRole('button', { name: /Suite Bank Quiz/ }).click()
  await expect(page.getByText('Bank question: pick Yes')).toBeVisible()
})

test('marks a video as watched', async ({ page }) => {
  covers('action:learning.markVideoWatched')
  await open(page, LEARN)
  await page.getByRole('button', { name: /Suite Video/ }).click()
  await page.getByRole('button', { name: /Mark as Watched/ }).click()
  await expect.poll(async () => (await submissionFor(BLOCK.video))?.status).toBeTruthy()
})

test('opening an attendance block records the learner present', async ({ page }) => {
  covers('action:attendance.markSelfAttendance')
  await open(page, LEARN)
  await page.getByRole('button', { name: /Suite Attendance/ }).click()
  await expect.poll(async () => (await submissionFor(BLOCK.attendance))?.content, { timeout: 10_000 })
    .toMatchObject({ attendance_status: 'present' })
})

test('posts a discussion reply', async ({ page }) => {
  await open(page, LEARN)
  await page.getByRole('button', { name: /Suite Discussion/ }).click()
  await page.getByPlaceholder('Share your thoughts…').fill('My takeaway: belonging matters.')
  await page.getByRole('button', { name: 'Post reply' }).click()
  await expect(page.getByRole('list', { name: 'Discussion replies' }).getByText('My takeaway: belonging matters.')).toBeVisible()
  await expect.poll(async () => (await submissionFor(BLOCK.discussion))?.content).toMatchObject({ text: 'My takeaway: belonging matters.' })
})

test.describe('teacher grades the discussion reply', () => {
  test.use(asActor('teacher'))
  test('from the learn view', async ({ page }) => {
    covers('action:learning.gradeDiscussionSubmission')
    await open(page, LEARN)
    await page.getByRole('button', { name: /Suite Discussion/ }).click()
    await page.getByRole('button', { name: 'Grade' }).first().click()
    await page.getByLabel('Score', { exact: true }).fill('9')
    await page.getByRole('button', { name: 'Save Grade' }).click()
    await expect.poll(async () => Number((await submissionFor(BLOCK.discussion))?.score)).toBe(9)
  })
})
