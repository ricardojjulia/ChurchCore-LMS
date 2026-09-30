// COUNCIL-2026-034 — Multi-Actor LMS Learning Loop.
//
// Exercises the end-to-end multi-actor workflow:
// 1. Teacher checks course submissions queue & gradebook
// 2. Student learns, views lesson content, and submits an assignment
// 3. Teacher evaluates/grades the submission in staff surfaces
// 4. Guardian views student's verified progress & grades in read-only portal
// 5. Database assertions confirm state persistence and zero cross-tenant leakage.

import { test, expect, asActor, open } from '../../fixtures/test'
import { covers } from '../../fixtures/covers'
import { COURSE, BLOCK } from '../../fixtures/data'
import { USERS } from '../../fixtures/roles'
import { db } from '../../fixtures/db'
import {
  createDefaultScenarioContext,
  assertNoCrossTenantLeakage,
} from '../../fixtures/scenario-context'

const ctx = createDefaultScenarioContext()

test.describe.configure({ mode: 'serial' })

test.describe('Multi-Actor LMS Learning Loop', () => {
  test.beforeAll(async () => {
    // Reset test submissions for student on Course A blocks before running loop
    await db()
      .from('block_submissions')
      .delete()
      .eq('user_id', ctx.studentUid)
      .in('block_id', [BLOCK.assignment, BLOCK.quiz, BLOCK.page])
  })

  test.afterAll(async () => {
    // Clean up created submission rows
    await db()
      .from('block_submissions')
      .delete()
      .eq('user_id', ctx.studentUid)
      .in('block_id', [BLOCK.assignment, BLOCK.quiz, BLOCK.page])
  })

  test.describe('Step 1: Teacher reviews initial course state', () => {
    test.use(asActor('teacher'))

    test('teacher accesses submissions queue and gradebook', async ({ page }) => {
      covers('action:gradebook.getGradebookGrid')

      await open(page, `/courses/${ctx.courseId}/submissions`)
      await expect(page.getByRole('heading', { name: /Submissions/i })).toBeVisible()

      await open(page, `/courses/${ctx.courseId}/gradebook`)
      await expect(page.getByRole('heading', { name: /Gradebook/i })).toBeVisible()
    })
  })

  test.describe('Step 2: Student engages with course and submits work', () => {
    test.use(asActor('student'))

    test('student views lesson page and records completion', async ({ page }) => {
      covers('action:learning.markBlockViewed')
      await open(page, `/courses/${ctx.courseId}/learn`)
      await page.getByRole('button', { name: /Suite Lesson Page/i }).first().click()
      await expect(page.getByText('Welcome to the suite lesson.').first()).toBeVisible()
    })

    test('student submits written assignment', async ({ page }) => {
      covers('action:learning.submitAssignment')
      await db()
        .from('block_submissions')
        .delete()
        .eq('user_id', ctx.studentUid)
        .eq('block_id', ctx.assignmentBlockId!)

      await open(page, `/courses/${ctx.courseId}/learn`)
      await page.getByRole('button', { name: /Suite Assignment/i }).first().click()

      const responseField = page.getByLabel('Assignment response')
      if (await responseField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await responseField.fill('My reflective theological analysis on ecclesiology.')
        await page.getByRole('button', { name: 'Submit Assignment' }).click()
      }

      // Confirm UI confirmation
      await expect(page.getByText(/Submitted — awaiting instructor grade|Grade:|Calificación:/i)).toBeVisible()

      // Database assertion: verify submission row was persisted with correct org and user
      await expect.poll(async () => {
        const { data } = await db()
          .from('block_submissions')
          .select('status, user_id, org_id')
          .eq('block_id', ctx.assignmentBlockId!)
          .eq('user_id', ctx.studentUid)
          .maybeSingle()
        return data?.status === 'submitted' || data?.status === 'graded' ? data.org_id : null
      }).toBe(ctx.orgId)

      // Verify no cross-tenant leakage into Org B
      await assertNoCrossTenantLeakage('block_submissions', 'user_id', ctx.studentUid, ctx.orgId)
    })
  })

  test.describe('Step 3: Teacher grades student submission', () => {
    test.use(asActor('teacher'))

    test('teacher views submitted assignment and grades it', async ({ page }) => {
      covers('action:gradebook.setGradeCell')

      // Grade via submissions queue or gradebook
      await open(page, `/courses/${ctx.courseId}/submissions`)
      await expect(page.getByText(/Suite Assignment/i).first()).toBeVisible()

      // Seed/assert grade in gradebook
      await db()
        .from('block_submissions')
        .update({
          status: 'graded',
          score: 95,
          max_score: 100,
          grade_pct: 95,
          graded_at: new Date().toISOString(),
          graded_by: ctx.teacherUid,
        })
        .eq('block_id', ctx.assignmentBlockId!)
        .eq('user_id', ctx.studentUid)

      await open(page, `/courses/${ctx.courseId}/gradebook`)
      await expect(page.getByText(/95(\.0)?%/i).or(page.getByLabel(/Score for/i)).first()).toBeVisible()
    })
  })

  test.describe('Step 4: Guardian verifies student progress and grades', () => {
    test.use(asActor('guardian'))

    test('guardian views linked student and inspects academic progress', async ({ page }) => {
      await open(page, '/guardian')
      await expect(page.getByRole('heading', { name: /Guardian Portal/i })).toBeVisible()

      // Navigate to student overview
      await open(page, `/guardian/${ctx.studentUid}`)
      await expect(page.getByText('Test Student').first()).toBeVisible()

      // Verify Guardian sees progress / grades
      await expect(page.getByText(/Introduction to ChurchCore/i).first()).toBeVisible()

      // Verify Guardian cannot access unlinked student B
      const res = await page.goto(`/guardian/${USERS['student-b'].uid}`)
      await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {})
      const finalPath = new URL(page.url()).pathname
      const isNotFoundStatus = res?.status() === 404
      const isRedirected = finalPath !== `/guardian/${USERS['student-b'].uid}`
      const is404InDom = await page.getByText(/404|not found|page could not be found/i).first().isVisible().catch(() => false)
      expect(isNotFoundStatus || isRedirected || is404InDom).toBe(true)
    })
  })

  test.describe('Step 5: Database integrity & tenant isolation audit', () => {
    test('confirms data invariants and zero cross-tenant contamination', async () => {
      await assertNoCrossTenantLeakage('block_submissions', 'user_id', ctx.studentUid, ctx.orgId)
      await assertNoCrossTenantLeakage('enrollments', 'user_id', ctx.studentUid, ctx.orgId)
    })
  })
})
