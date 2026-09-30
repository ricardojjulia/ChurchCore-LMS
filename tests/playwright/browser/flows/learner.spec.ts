// COUNCIL-2026-031 D4.3 — the learner journey through a course, as the
// seeded student, asserting what each step persisted.
import { test, expect, asActor, open } from '../../fixtures/test'
import { covers } from '../../fixtures/covers'
import { BLOCK, CERT_NO, COURSE } from '../../fixtures/data'
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
  await db().from('survey_participation').delete().eq('block_id', BLOCK.survey)
  await db().from('survey_responses').delete().eq('block_id', BLOCK.survey)
  await db().from('checklist_progress').delete().eq('block_id', BLOCK.checklist)
})

// A learner's block_completion engagement event for a block (what progress counts).
async function completed(blockId: string) {
  const { data } = await db().from('engagement_events').select('id')
    .eq('user_id', student).eq('source_id', blockId).eq('event_type', 'block_completion').maybeSingle()
  return !!data
}

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
  if (await page.getByLabel('Assignment response').isVisible()) {
    await page.getByLabel('Assignment response').fill('The lesson was about welcome and belonging.')
    await page.getByRole('button', { name: 'Submit Assignment' }).click()
  }
  await expect(page.getByText(/Submitted — awaiting instructor grade|Grade:|Calificación:/i)).toBeVisible()
  await expect.poll(async () => ['submitted', 'graded'].includes((await submissionFor(BLOCK.assignment))?.status ?? '')).toBe(true)
})

test('takes and passes the auto-graded quiz', async ({ page }) => {
  covers('action:learning.submitQuiz')
  await open(page, LEARN)
  await page.getByRole('button', { name: /Suite Quiz/ }).first().click()
  if (await page.getByRole('radiogroup').first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByRole('radiogroup').nth(0).getByRole('radio', { name: /Alpha/ }).click()
    await page.getByRole('radiogroup').nth(1).getByRole('radio', { name: /True/ }).click()
    await page.getByRole('button', { name: /Submit Quiz/ }).click()
  }
  await expect(page.getByText('100%').first()).toBeVisible({ timeout: 15000 })
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

test('works through a checklist; required items complete it', async ({ page }) => {
  covers('action:activities.saveChecklistProgress', 'action:activities.getMyActivityState')
  await open(page, LEARN)
  await page.getByRole('button', { name: /Suite Checklist/ }).click()
  await page.getByRole('checkbox', { name: 'Read Romans 1' }).check()
  await expect.poll(async () => (await db().from('checklist_progress').select('checked')
    .eq('block_id', BLOCK.checklist).eq('user_uid', student).maybeSingle()).data?.checked).toEqual(['ci1'])
  await page.getByRole('checkbox', { name: 'Meet a mentor' }).check()
  await expect(page.getByText('All required steps are done.')).toBeVisible()
  await expect.poll(() => completed(BLOCK.checklist)).toBe(true)
})

test('reviews every flashcard to complete the set', async ({ page }) => {
  await open(page, LEARN)
  await page.getByRole('button', { name: /Suite Flashcards/ }).click()
  await page.getByRole('button', { name: 'Show answer' }).click()
  await expect(page.getByText('Genesis')).toBeVisible()
  await page.getByRole('button', { name: 'Next card' }).click()
  await page.getByRole('button', { name: 'Show answer' }).click()
  await expect(page.getByText("You've reviewed every card.")).toBeVisible()
  await expect.poll(() => completed(BLOCK.flashcards)).toBe(true)
})

test('answers the anonymous survey once; no name is stored', async ({ page }) => {
  covers('action:activities.submitSurvey')
  await open(page, LEARN)
  await page.getByRole('button', { name: /Suite Survey/ }).click()
  await page.getByRole('group', { name: /The lesson was helpful/ }).getByRole('radio', { name: '5' }).check()
  await page.getByRole('radio', { name: 'Reading' }).check()
  await page.getByLabel('Your answer: Anything else?').fill('More small groups, please.')
  await page.getByRole('button', { name: 'Submit responses' }).click()
  await expect(page.getByText('Thanks. Your response has been recorded.')).toBeVisible()
  const { data: rows } = await db().from('survey_responses').select('answers, respondent_uid').eq('block_id', BLOCK.survey)
  expect(rows).toEqual([{ answers: { sq1: 5, sq2: 'Reading', sq3: 'More small groups, please.' }, respondent_uid: null }])
  await expect.poll(() => completed(BLOCK.survey)).toBe(true)

  // Coming back shows the thank-you state, not the form.
  await open(page, LEARN)
  await page.getByRole('button', { name: /Suite Survey/ }).click()
  await expect(page.getByText('Thanks. Your response has been recorded.')).toBeVisible()
})

test.describe('teacher reads the survey results', () => {
  test.use(asActor('teacher'))
  test('sees aggregates without names', async ({ page }) => {
    covers('page:/courses/[id]/surveys/[blockId]')
    await open(page, `/courses/${COURSE.a}/surveys/${BLOCK.survey}`)
    await expect(page.getByText(/1 response · Anonymous/)).toBeVisible()
    await expect(page.getByText('More small groups, please.')).toBeVisible()
    await expect(page.getByText('Test Student A')).toHaveCount(0)
  })
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

test.describe('certificate verification', () => {
  test.use(asActor('anon'))
  test('a third party verifies a real certificate and rejects an unknown one', async ({ page }) => {
    covers('page:/verify/[certNo]')
    await open(page, `/verify/${CERT_NO}`)
    await expect(page.getByText('Certificate Verified')).toBeVisible()
    await open(page, '/verify/NOT-A-REAL-CERT')
    await expect(page.getByText('No record matches this certificate number')).toBeVisible()
  })
})
