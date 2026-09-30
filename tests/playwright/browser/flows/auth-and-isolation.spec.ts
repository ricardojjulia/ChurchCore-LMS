// COUNCIL-2026-034 — Multi-Actor Authentication, Role-Gating & Tenant Isolation.
//
// Verifies boundary enforcement across:
// 1. Unauthenticated (anon) access barriers & redirects to /login
// 2. Intra-tenant role boundaries (student/guardian blocked from admin/staff surfaces)
// 3. Inter-tenant isolation (Org B identities blocked from Org A resources)
// 4. Paired database / RLS security assertions

import { test, expect, asActor, open } from '../../fixtures/test'
import { COURSE, ORG_A } from '../../fixtures/data'
import { USERS } from '../../fixtures/roles'
import { db } from '../../fixtures/db'
import { assertNoCrossTenantLeakage } from '../../fixtures/scenario-context'

const DENIAL_TEXT = /not found|404|permission|access denied|forbidden|not authori[sz]ed/i

test.describe('Authentication, Role-Gating & Tenant Isolation', () => {
  test.describe('1. Unauthenticated (anon) Access Barriers', () => {
    test.use(asActor('anon'))

    const PROTECTED_ROUTES = [
      '/dashboard',
      `/courses/${COURSE.a}`,
      `/courses/${COURSE.a}/learn`,
      `/courses/${COURSE.a}/submissions`,
      '/admin',
      '/admin/terms',
      '/guardian',
      '/platform',
    ]

    for (const route of PROTECTED_ROUTES) {
      test(`anon navigating to ${route} is redirected to /login`, async ({ page }) => {
        await page.goto(route)
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
        const finalUrl = new URL(page.url())
        expect(
          finalUrl.pathname === '/login' || finalUrl.searchParams.has('next'),
          `Expected redirect to /login from ${route}, arrived at ${finalUrl.pathname}`,
        ).toBe(true)
      })
    }
  })

  test.describe('2. Intra-Tenant Role-Gating: Student Boundaries', () => {
    test.use(asActor('student'))

    const STAFF_ONLY_ROUTES = [
      '/admin',
      '/admin/terms',
      '/admin/blueprints',
      `/courses/${COURSE.a}/submissions`,
      `/courses/${COURSE.a}/gradebook`,
      `/courses/${COURSE.a}/build`,
      '/platform',
    ]

    for (const route of STAFF_ONLY_ROUTES) {
      test(`student is denied access to staff surface ${route}`, async ({ page }) => {
        const res = await page.goto(route)
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
        const finalPath = new URL(page.url()).pathname
        const leftPage = decodeURI(finalPath) !== route
        const notFound = res?.status() === 404
        const deniedInPlace = !leftPage && DENIAL_TEXT.test(await page.locator('body').innerText())

        expect(
          leftPage || notFound || deniedInPlace,
          `Student must not access staff route ${route} (landed at ${finalPath}, status ${res?.status()})`,
        ).toBe(true)
      })
    }
  })

  test.describe('3. Intra-Tenant Role-Gating: Guardian Boundaries', () => {
    test.use(asActor('guardian'))

    test('guardian is blocked from administrative and course authoring surfaces', async ({ page }) => {
      const routes = ['/admin', `/courses/${COURSE.a}/build`, '/platform']
      for (const route of routes) {
        const res = await page.goto(route)
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
        const finalPath = new URL(page.url()).pathname
        const leftPage = decodeURI(finalPath) !== route
        const notFound = res?.status() === 404
        const deniedInPlace = !leftPage && DENIAL_TEXT.test(await page.locator('body').innerText())
        expect(
          leftPage || notFound || deniedInPlace,
          `Guardian must not access ${route}`,
        ).toBe(true)
      }
    })
  })

  test.describe('4. Inter-Tenant Isolation: Cross-Org Denial (Org B -> Org A)', () => {
    test.describe('as Student B (Org B)', () => {
      test.use(asActor('student-b'))

      test('Student B cannot access Course A learner surface', async ({ page }) => {
        const res = await page.goto(`/courses/${COURSE.a}/learn`)
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
        const finalPath = new URL(page.url()).pathname
        const leftPage = decodeURI(finalPath) !== `/courses/${COURSE.a}/learn`
        const notFound = res?.status() === 404
        const deniedInPlace = !leftPage && DENIAL_TEXT.test(await page.locator('body').innerText())

        expect(
          leftPage || notFound || deniedInPlace,
          `Student B must not access Org A Course A (landed at ${finalPath})`,
        ).toBe(true)
      })
    })

    test.describe('as Admin B (Org B)', () => {
      test.use(asActor('admin-b'))

      test('Admin B cannot manage Org A course submissions or gradebook', async ({ page }) => {
        const routes = [`/courses/${COURSE.a}/submissions`, `/courses/${COURSE.a}/gradebook`, `/courses/${COURSE.a}/build`]
        for (const route of routes) {
          const res = await page.goto(route)
          await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
          const finalPath = new URL(page.url()).pathname
          const leftPage = decodeURI(finalPath) !== route
          const notFound = res?.status() === 404
          const deniedInPlace = !leftPage && DENIAL_TEXT.test(await page.locator('body').innerText())

          expect(
            leftPage || notFound || deniedInPlace,
            `Admin B must not access Org A route ${route}`,
          ).toBe(true)
        }
      })
    })
  })

  test.describe('5. Database & RLS Tenant Isolation Verification', () => {
    test('confirms database rows are partitioned and non-leaking', async () => {
      // Check Org A courses
      const { data: coursesOrgA } = await db()
        .from('courses')
        .select('id, org_id')
        .eq('id', COURSE.a)
        .single()

      expect(coursesOrgA?.org_id).toBe(ORG_A)

      // Ensure no rows in Org B point to Course A
      await assertNoCrossTenantLeakage('courses', 'id', COURSE.a, ORG_A)
    })
  })
})
