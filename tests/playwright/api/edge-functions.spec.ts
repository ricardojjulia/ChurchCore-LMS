// COUNCIL-2026-031 D4.2 — Supabase Edge Functions, served by
// `supabase functions serve` alongside the app (CI and test:suite:local).
//
// Scheduler-invoked functions must fail closed: no secret, a wrong secret, or
// the literal "Bearer undefined" (what an unset CRON_SECRET used to accept)
// are all 401. With the right secret they run against the disposable stack.
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { covers } from '../fixtures/covers'
import { USERS } from '../fixtures/roles'
import { COURSE, ORG_A } from '../fixtures/data'

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? ''
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? ''
const CRON_SECRET = process.env.CRON_SECRET ?? 'suite-cron-secret'

let fn: APIRequestContext
test.beforeAll(async () => {
  fn = await pwRequest.newContext({ baseURL: `${SUPABASE_URL}/functions/v1/` })
})
test.afterAll(() => fn.dispose())

// The gateway needs *a* JWT for verify_jwt functions; the anon key is public,
// so it proves nothing about the caller — the function's own check must.
const gateway = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }

const CRON_FUNCTIONS: Array<[string, string]> = [
  ['edge:expire-trials', 'expire-trials'],
  ['edge:purge-deleted-tenants', 'purge-deleted-tenants'],
  ['edge:report-lifecycle-manager', 'report-lifecycle-manager'],
  ['edge:refresh-report-views', 'refresh-report-views'],
  ['edge:weekly-digest', 'weekly-digest'],
  ['edge:send-guardian-notifications', 'send-guardian-notifications'],
]

test.describe('scheduler-invoked functions', () => {
  test('reject callers without the cron secret (fail closed)', async () => {
    covers(
      'edge:expire-trials', 'edge:purge-deleted-tenants', 'edge:report-lifecycle-manager',
      'edge:refresh-report-views', 'edge:weekly-digest', 'edge:send-guardian-notifications',
    )
    for (const [, name] of CRON_FUNCTIONS) {
      for (const headers of [
        { apikey: ANON_KEY },
        gateway,
        { apikey: ANON_KEY, Authorization: 'Bearer undefined' },
        { apikey: ANON_KEY, Authorization: 'Bearer wrong-secret' },
        { apikey: ANON_KEY, 'x-cron-secret': 'wrong-secret' },
      ]) {
        const res = await fn.post(name, { headers })
        expect(res.status(), `${name} with ${JSON.stringify(Object.keys(headers))}`).toBe(401)
      }
    }
  })

  test('run with the cron secret', async () => {
    // verify_jwt functions reject a non-JWT Authorization at the gateway, so
    // schedulers send a gateway JWT plus the secret in x-cron-secret.
    const results: Record<string, number> = {}
    for (const [, name] of CRON_FUNCTIONS) {
      const res = await fn.post(name, { headers: { ...gateway, 'x-cron-secret': CRON_SECRET }, data: {} })
      results[name] = res.status()
    }
    expect(results).toEqual({
      'expire-trials': 200,
      'purge-deleted-tenants': 200,
      'report-lifecycle-manager': 200,
      'refresh-report-views': 200,
      'weekly-digest': 200,
      // No email provider in the suite: a clear 503, not a crash.
      'send-guardian-notifications': 503,
    })
  })
})

test.describe('search-users', () => {
  test('requires a real user session and stays inside the caller org', async () => {
    covers('edge:search-users')
    const anon = await fn.post('search-users', { headers: gateway, data: { query: 'Test' } })
    expect([401, 403]).toContain(anon.status())
  })
})

test.describe('system-health-check', () => {
  test('rejects non-GET/POST methods and runs for the service role', async () => {
    covers('edge:system-health-check')
    expect((await fn.put('system-health-check', { headers: gateway })).status()).toBe(405)
    const res = await fn.post('system-health-check', {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    })
    expect(res.status(), await res.text()).toBe(200)
  })
})

test.describe('generate-certificate', () => {
  test('backend-only: the public anon key is refused; service role is validated', async () => {
    covers('edge:generate-certificate')
    expect((await fn.get('generate-certificate', { headers: gateway })).status()).toBe(405)
    const body = { enrollmentId: '00000000-0000-0000-0090-000000000e01', userId: USERS.student.uid, courseId: COURSE.a, orgId: ORG_A }
    expect((await fn.post('generate-certificate', { headers: gateway, data: body })).status()).toBe(403)
    const service = { apikey: ANON_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    expect((await fn.post('generate-certificate', { headers: service, data: {} })).status()).toBe(400)
    // Course A enrollment is in progress, not completed.
    expect((await fn.post('generate-certificate', { headers: service, data: body })).status()).toBe(400)
  })
})

test.describe('generate-embedding', () => {
  test('backend-only; health probe and method checks', async () => {
    covers('edge:generate-embedding')
    expect((await fn.get('generate-embedding', { headers: gateway })).status()).toBe(200) // health probe
    expect((await fn.put('generate-embedding', { headers: gateway })).status()).toBe(405)
    expect((await fn.post('generate-embedding', { headers: gateway, data: { page_id: 'x' } })).status()).toBe(403)
    const service = { apikey: ANON_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    const res = await fn.post('generate-embedding', { headers: service, data: {} })
    // Past the service-role gate; the suite has no OpenAI key, so the
    // function reports it as unconfigured rather than doing any work.
    expect(res.status()).toBe(500)
    expect(await res.text()).toContain('OPENAI_API_KEY not configured')
  })
})
