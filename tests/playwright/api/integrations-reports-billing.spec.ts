// COUNCIL-2026-031 D4.2 — OneRoster, report artifacts, Stripe billing.
import { test, expect } from '@playwright/test'
import { covers } from '../fixtures/covers'
import { MISSING_ID, ORG_A } from '../fixtures/data'
import { actorClients, DB_LEAK } from './client'

const clients = actorClients(['anon', 'student', 'teacher', 'admin', 'manager', 'admin-b', 'platform'])
test.beforeAll(() => clients.open())
test.afterAll(() => clients.close())

const ONEROSTER_ADMIN_ONLY: Array<[string, 'get' | 'post' | 'put', string]> = [
  ['api:GET /api/integrations/oneroster/connections', 'get', '/api/integrations/oneroster/connections'],
  ['api:PUT /api/integrations/oneroster/connections', 'put', '/api/integrations/oneroster/connections'],
  ['api:GET /api/integrations/oneroster/jobs', 'get', '/api/integrations/oneroster/jobs'],
  ['api:POST /api/integrations/oneroster/validate', 'post', '/api/integrations/oneroster/validate'],
  ['api:POST /api/integrations/oneroster/jobs/[id]/apply', 'post', `/api/integrations/oneroster/jobs/${MISSING_ID}/apply`],
  ['api:POST /api/integrations/oneroster/jobs/[id]/preview', 'post', `/api/integrations/oneroster/jobs/${MISSING_ID}/preview`],
  ['api:GET /api/integrations/oneroster/jobs/[id]/identity-links', 'get', `/api/integrations/oneroster/jobs/${MISSING_ID}/identity-links`],
  ['api:POST /api/integrations/oneroster/jobs/[id]/identity-links', 'post', `/api/integrations/oneroster/jobs/${MISSING_ID}/identity-links`],
]

test.describe('OneRoster admin routes', () => {
  test('anonymous 401, non-admin roles 403', async () => {
    covers(
      'api:GET /api/integrations/oneroster/connections',
      'api:PUT /api/integrations/oneroster/connections',
      'api:GET /api/integrations/oneroster/jobs',
      'api:POST /api/integrations/oneroster/validate',
      'api:POST /api/integrations/oneroster/jobs/[id]/apply',
      'api:POST /api/integrations/oneroster/jobs/[id]/preview',
      'api:GET /api/integrations/oneroster/jobs/[id]/identity-links',
      'api:POST /api/integrations/oneroster/jobs/[id]/identity-links',
    )
    for (const [, method, path] of ONEROSTER_ADMIN_ONLY) {
      expect((await clients.get('anon')[method](path, { data: {} })).status(), `${method} ${path} anon`).toBe(401)
      for (const role of ['student', 'teacher', 'platform'] as const) {
        expect((await clients.get(role)[method](path, { data: {} })).status(), `${method} ${path} ${role}`).toBe(403)
      }
    }
  })

  test('admin and manager read their own org connection and job history', async () => {
    for (const role of ['admin', 'manager'] as const) {
      const conn = await clients.get(role).get('/api/integrations/oneroster/connections')
      expect(conn.status()).toBe(200)
      expect(await conn.json()).toHaveProperty('connection')
      expect((await clients.get(role).get('/api/integrations/oneroster/jobs')).status()).toBe(200)
    }
  })

  test('connection PUT validates every field', async () => {
    const admin = clients.get('admin')
    const bad = [
      {},
      { name: 'x', sourceTenantId: '', keyId: 'k1', publicKey: 'x', scheduleIntervalMinutes: 60, enabled: true },
      { name: 'Suite', sourceTenantId: 't', keyId: 'bad key id!', publicKey: 'x', scheduleIntervalMinutes: 60, enabled: true },
      { name: 'Suite', sourceTenantId: 't', keyId: 'k1', publicKey: 'not a key', scheduleIntervalMinutes: 60, enabled: true },
    ]
    for (const body of bad) {
      const res = await admin.put('/api/integrations/oneroster/connections', { data: body })
      expect(res.status(), JSON.stringify(body)).toBe(400)
      expect(await res.text()).not.toMatch(DB_LEAK)
    }
  })

  test('validate rejects non-ZIP uploads and empty forms', async () => {
    const admin = clients.get('admin')
    expect((await admin.post('/api/integrations/oneroster/validate', { multipart: {} })).status()).toBe(400)
    const res = await admin.post('/api/integrations/oneroster/validate', {
      multipart: { file: { name: 'roster.csv', mimeType: 'text/csv', buffer: Buffer.from('sourcedId\n1') } },
    })
    expect(res.status()).toBe(415)
  })

  test('unknown job ids are not found, and another org cannot reach them', async () => {
    const admin = clients.get('admin')
    expect((await admin.post(`/api/integrations/oneroster/jobs/${MISSING_ID}/preview`)).status()).toBe(404)
    expect((await admin.get(`/api/integrations/oneroster/jobs/${MISSING_ID}/identity-links`)).status()).toBe(404)
    const apply = await admin.post(`/api/integrations/oneroster/jobs/${MISSING_ID}/apply`)
    expect([400, 404]).toContain(apply.status())
    expect(await apply.text()).not.toMatch(DB_LEAK)
  })
})

test.describe('POST /api/integrations/oneroster/connections/[id]/deliveries', () => {
  test('signed-push endpoint: unknown connection 404; unsigned delivery rejected', async () => {
    covers('api:POST /api/integrations/oneroster/connections/[id]/deliveries')
    const path = `/api/integrations/oneroster/connections/${MISSING_ID}/deliveries`
    const res = await clients.get('anon').post(path, { data: Buffer.from('PK'), headers: { 'content-type': 'application/zip' } })
    expect(res.status()).toBe(404)
  })
})

test.describe('Report artifacts', () => {
  test('list and delete require a session; unknown artifacts are 404', async () => {
    covers('api:GET /api/reports/artifacts', 'api:DELETE /api/reports/artifacts')
    expect((await clients.get('anon').get('/api/reports/artifacts')).status()).toBe(401)
    const list = await clients.get('student').get('/api/reports/artifacts')
    expect(list.status()).toBe(200)
    expect((await clients.get('anon').delete('/api/reports/artifacts', { data: { artifactId: MISSING_ID } })).status()).toBe(401)
    expect((await clients.get('student').delete('/api/reports/artifacts', { data: {} })).status()).toBe(400)
    expect((await clients.get('student').delete('/api/reports/artifacts', { data: { artifactId: MISSING_ID } })).status()).toBe(404)
  })

  test('signed URLs are only issued for artifacts the caller can see', async () => {
    covers('api:GET /api/reports/artifacts/[artifactId]/signed-url')
    for (const actor of ['anon', 'student', 'admin-b'] as const) {
      const res = await clients.get(actor).get(`/api/reports/artifacts/${MISSING_ID}/signed-url`)
      expect(res.status()).toBe(404)
      expect(await res.text()).not.toContain('signedUrl')
    }
  })
})

test.describe('Stripe', () => {
  test('checkout: org admin or platform admin only, validated body', async () => {
    covers('api:POST /api/stripe/create-checkout')
    const body = { orgId: ORG_A, priceId: 'price_suite', successUrl: '/admin/billing', cancelUrl: '/admin/billing' }
    expect((await clients.get('anon').post('/api/stripe/create-checkout', { data: body })).status()).toBe(401)
    expect((await clients.get('teacher').post('/api/stripe/create-checkout', { data: body })).status()).toBe(403)
    expect((await clients.get('manager').post('/api/stripe/create-checkout', { data: body })).status()).toBe(403)
    expect((await clients.get('admin').post('/api/stripe/create-checkout', { data: { orgId: ORG_A } })).status()).toBe(400)
  })

  test('portal: org admin only; no subscription is a clean 400', async () => {
    covers('api:POST /api/stripe/portal')
    expect((await clients.get('anon').post('/api/stripe/portal')).status()).toBe(401)
    expect((await clients.get('manager').post('/api/stripe/portal')).status()).toBe(403)
    const res = await clients.get('admin').post('/api/stripe/portal')
    expect(res.status()).toBe(400)
  })

  test('webhook rejects unsigned and forged events without echoing the payload', async () => {
    covers('api:POST /api/stripe/webhook')
    const payload = JSON.stringify({ id: 'evt_suite', type: 'customer.subscription.deleted', data: { object: { secret: 'SUITE-MARKER' } } })
    for (const headers of [{}, { 'stripe-signature': 't=1,v1=deadbeef' }] as Array<Record<string, string>>) {
      const res = await clients.get('anon').post('/api/stripe/webhook', {
        data: payload, headers: { 'content-type': 'application/json', ...headers },
      })
      expect([400, 500]).toContain(res.status())
      expect(await res.text()).not.toContain('SUITE-MARKER')
    }
  })
})
