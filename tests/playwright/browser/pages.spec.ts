// COUNCIL-2026-031 D4.1 — every page × every actor.
//
// Allowed actors: the page renders at its own URL (or its declared dispatch
// target), with no error boundary, no uncaught errors or console.error, a main
// landmark, and — once per page — no serious/critical axe violations.
// Denied actors: anonymous visitors land on /login; signed-in users are sent
// elsewhere or shown not-found/permission state, never the page itself.
import { test, expect, asActor, expectAccessible, expectHealthyPage } from '../fixtures/test'
import { ORG_A_ROLES, type Actor } from '../fixtures/roles'
import { ROUTES } from './routes'

const ACTORS: Actor[] = ['anon', ...ORG_A_ROLES]
const DENIAL_TEXT = /not found|404|permission|access denied|forbidden|not authori[sz]ed/i

for (const route of ROUTES) {
  const tags = route.mobile ? ['@mobile'] : []
  test.describe(`${route.path}`, { tag: tags }, () => {
    for (const actor of ACTORS) {
      const allowed = route.allow.includes(actor)
      test.describe(`as ${actor}`, () => {
        test.use(asActor(actor))

        test(allowed ? 'renders' : 'is denied', async ({ page }, testInfo) => {
          const response = await page.goto(route.path + (route.query ?? ''))
          // Pages with a loading.tsx stream first; a server redirect() then
          // lands client-side after hydration, so settle before judging.
          await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
          const finalPath = new URL(page.url()).pathname

          if (allowed) {
            expect(response?.status() ?? 200, `HTTP status for ${route.path}`).toBeLessThan(400)
            const forwardTo = route.redirects?.[actor]
            if (forwardTo) expect(finalPath).toMatch(forwardTo)
            else expect(decodeURI(finalPath)).toBe(route.path)
            await expectHealthyPage(page)
            await expect(page.locator('main, [role="main"]').first()).toBeAttached()
            const firstAllowed = route.allow[0] === actor
            if (firstAllowed && testInfo.project.name === 'browser') {
              await expectAccessible(page, route.surface, testInfo)
            }
            return
          }

          if (actor === 'anon') {
            expect(finalPath, `anonymous visit to ${route.path}`).toBe('/login')
            return
          }
          // A streamed page's server redirect() is followed client-side; on a
          // slow runner it can land after networkidle, so give it time.
          if (decodeURI(finalPath) === route.path && response?.status() !== 404) {
            await page.waitForURL((u) => decodeURI(u.pathname) !== route.path, { timeout: 10_000 }).catch(() => {})
          }
          const settledPath = new URL(page.url()).pathname
          const leftPage = decodeURI(settledPath) !== route.path
          const notFound = response?.status() === 404
          const deniedInPlace = !leftPage && DENIAL_TEXT.test(await page.locator('body').innerText())
          expect(
            leftPage || notFound || deniedInPlace,
            `${actor} must not see ${route.path} (stayed at ${settledPath}, status ${response?.status()})`,
          ).toBe(true)
        })
      })
    }
  })
}
