// Shared Playwright `test` for the suite: fails a test on uncaught page errors
// and console.error output, and exposes helpers every browser spec needs.
import { test as base, expect, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { storageStatePath, type Actor } from './roles'
import known from '../../surface/a11y-known.json'

// Console noise that is not an application defect. Keep this list short and
// specific; anything added here must say why.
const BENIGN_CONSOLE = [
  /Download the React DevTools/,                       // dev-only banner
  /\[Fast Refresh\]/,                                  // dev-only HMR logs
  /Failed to load resource: .*favicon/,                // browsers probe favicons
  /Failed to load resource: the server responded with a status of 40[13]/, // expected on deliberate forbidden checks
  /Sentry Logger/,                                     // Sentry SDK debug line when DSN unset
]

type Fixtures = {
  consoleErrors: string[]
}

export const test = base.extend<Fixtures>({
  // Next <Link> prefetches every visible route, and each prefetch runs the
  // middleware's auth.getUser(). Across hundreds of tests that is ~28 auth
  // round trips per page and exhausts the local auth container's sockets.
  // Prefetching is a pure performance optimization, so the suite skips it.
  page: async ({ page }, provide) => {
    await page.route('**/*', (route) =>
      route.request().headers()['next-router-prefetch'] ? route.fulfill({ status: 204, body: '' }) : route.fallback(),
    )
    await provide(page)
  },
  consoleErrors: [async ({ page }, provide, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      if (BENIGN_CONSOLE.some((re) => re.test(text))) return
      errors.push(`console.error: ${text}`)
    })
    await provide(errors)
    if (errors.length && testInfo.status === testInfo.expectedStatus) {
      await testInfo.attach('console-errors', { body: errors.join('\n'), contentType: 'text/plain' })
      throw new Error(`Page emitted ${errors.length} error(s):\n${errors.join('\n')}`)
    }
  }, { auto: true }],
})

export { expect }

export function asActor(actor: Actor) {
  return actor === 'anon' ? { storageState: { cookies: [], origins: [] } } : { storageState: storageStatePath(actor) }
}

// Text the Next.js error boundary, not-found page, or dev overlay renders.
const ERROR_MARKERS = [
  /Application error: a (client|server)-side exception/i,
  /Unhandled Runtime Error/i,
  /Internal Server Error/i,
]

export async function expectHealthyPage(page: Page) {
  const body = await page.locator('body').innerText()
  for (const re of ERROR_MARKERS) expect(body, `error marker ${re} on ${page.url()}`).not.toMatch(re)
  await expect(page.locator('#nextjs__container_errors_label, nextjs-portal [data-nextjs-dialog]')).toHaveCount(0)
}

// Serious/critical axe violations fail the test; the rule/route pairs listed in
// tests/surface/a11y-known.json are tolerated until their expiry date.

type KnownViolation = { rule: string; route: string; reason: string; expires: string }

export async function expectAccessible(page: Page, route: string, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const today = new Date().toISOString().slice(0, 10)
  const tolerated = (known as KnownViolation[]).filter((k) => k.route === route && k.expires >= today).map((k) => k.rule)
  const blocking = results.violations.filter(
    (v) => (v.impact === 'serious' || v.impact === 'critical') && !tolerated.includes(v.id),
  )
  if (blocking.length) {
    await testInfo.attach('axe', { body: JSON.stringify(blocking, null, 2), contentType: 'application/json' })
  }
  expect(
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
    `accessibility violations on ${route}`,
  ).toEqual([])
}
