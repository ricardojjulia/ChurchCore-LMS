// COUNCIL-2026-031 D4.2 — core API routes: auth, role, validation, not-found,
// tenant isolation, and no internal detail in error bodies.
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'
import { covers } from '../fixtures/covers'
import { COURSE, MISSING_ID } from '../fixtures/data'
import { USERS } from '../fixtures/roles'
import { actorClients, DB_LEAK } from './client'

const clients = actorClients(['anon', 'student', 'teacher', 'admin', 'student-b', 'guardian'])
test.beforeAll(() => clients.open())
test.afterAll(() => clients.close())

test.describe('POST /api/analytics/events', () => {
  test('requires a session and a valid event', async () => {
    covers('api:POST /api/analytics/events')
    const valid = { eventType: 'module_view', courseId: COURSE.a }
    expect((await clients.get('anon').post('/api/analytics/events', { data: valid })).status()).toBe(403)
    const student = clients.get('student')
    expect((await student.post('/api/analytics/events', { data: { eventType: 'not_a_real_event' } })).status()).toBe(400)
    expect((await student.post('/api/analytics/events', { data: { ...valid, courseId: 'not-a-uuid' } })).status()).toBe(400)
    const ok = await student.post('/api/analytics/events', { data: valid })
    expect(ok.status(), await ok.text()).toBeLessThan(300)
  })
})

test.describe('GET /api/calendar', () => {
  test('requires auth and returns only the caller org events', async () => {
    covers('api:GET /api/calendar')
    expect((await clients.get('anon').get('/api/calendar')).status()).toBe(401)
    const res = await clients.get('student').get('/api/calendar')
    expect(res.status()).toBe(200)
    const body = JSON.stringify(await res.json())
    const other = await (await clients.get('student-b').get('/api/calendar')).json()
    expect(JSON.stringify(other)).not.toContain('Suite Event')
    expect(body).toContain('Suite Event')
  })
})

test.describe('GET /api/certificates/[id]/pdf', () => {
  const certId = '00000000-0000-0000-0090-000000000901'

  test('requires auth; other tenants and unknown ids get 404', async () => {
    covers('api:GET /api/certificates/[id]/pdf')
    expect((await clients.get('anon').get(`/api/certificates/${certId}/pdf`)).status()).toBe(401)
    expect((await clients.get('student-b').get(`/api/certificates/${certId}/pdf`)).status()).toBe(404)
    expect((await clients.get('student').get(`/api/certificates/${MISSING_ID}/pdf`)).status()).toBe(404)
  })

  test('owner downloads their certificate as a PDF', async () => {
    // KNOWN DEFECT (COUNCIL-2026-031 findings): the App Router renders with
    // Next's bundled React 19 while @react-pdf/renderer (a default server
    // external) loads node_modules React 18 — rendering fails with React
    // error #31. Fix is the React 19 upgrade; this test then passes and
    // test.fail() makes the suite demand this marker be removed.
    test.fail()
    const own = await clients.get('student').get(`/api/certificates/${certId}/pdf`)
    expect(own.status()).toBe(200)
    expect(own.headers()['content-type']).toContain('application/pdf')
  })
})

test.describe('GET /api/digest (cron)', () => {
  test('requires the cron bearer secret; unconfigured email is a 503, not a crash', async () => {
    covers('api:GET /api/digest')
    expect((await clients.get('anon').get('/api/digest')).status()).toBe(401)
    expect((await clients.get('admin').get('/api/digest')).status()).toBe(401) // a session is not the cron secret
    expect((await clients.get('anon').get('/api/digest', { headers: { authorization: 'Bearer wrong' } })).status()).toBe(401)
    const res = await clients.get('anon').get('/api/digest', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'suite-cron-secret'}` },
    })
    expect([200, 503]).toContain(res.status())
  })
})

test.describe('POST /api/feedback', () => {
  test('validates input and records feedback in demo mode', async () => {
    covers('api:POST /api/feedback')
    const bad = await clients.get('student').post('/api/feedback', { data: { kind: 'nope' } })
    expect(bad.status()).toBe(400)
    expect(await bad.text()).not.toMatch(DB_LEAK)
    const res = await clients.get('student').post('/api/feedback', {
      data: {
        sessionId: crypto.randomUUID(), route: '/dashboard', category: 'BUG',
        note: `Suite feedback ${Date.now()}`, breadcrumbs: ['/dashboard'],
        appVersion: 'suite', sessionDurationSeconds: 5,
      },
    })
    expect(res.status(), await res.text()).toBe(201)
  })
})

function unsubscribeToken(payload: Record<string, unknown>, secret: string) {
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url')
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64(payload)
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

test.describe('GET /api/guardian/unsubscribe', () => {
  test('rejects missing, forged, and expired tokens; accepts a valid one', async () => {
    covers('api:GET /api/guardian/unsubscribe')
    const anon = clients.get('anon')
    expect((await anon.get('/api/guardian/unsubscribe')).status()).toBe(400)
    expect((await anon.get('/api/guardian/unsubscribe?token=a.b.c')).status()).toBe(400)
    const forged = unsubscribeToken({ sub: 'guardian-unsub', guardian_uid: USERS.guardian.uid, exp: 9_999_999_999 }, 'not-the-secret')
    expect((await anon.get(`/api/guardian/unsubscribe?token=${forged}`)).status()).toBe(400)

    const secret = process.env.SUPABASE_JWT_SECRET
    test.skip(!secret, 'SUPABASE_JWT_SECRET not available to the suite')
    // Correctly signed but minted for another purpose (e.g. an access token): rejected.
    const wrongPurpose = unsubscribeToken({ sub: 'someone', guardian_uid: USERS.guardian.uid, exp: 9_999_999_999 }, secret!)
    expect((await anon.get(`/api/guardian/unsubscribe?token=${wrongPurpose}`)).status()).toBe(400)
    const expired = unsubscribeToken({ sub: 'guardian-unsub', guardian_uid: USERS.guardian.uid, exp: 1 }, secret!)
    expect((await anon.get(`/api/guardian/unsubscribe?token=${expired}`)).status()).toBe(400)
    const valid = unsubscribeToken({ sub: 'guardian-unsub', guardian_uid: USERS.guardian.uid, exp: Math.floor(Date.now() / 1000) + 600 }, secret!)
    expect((await anon.get(`/api/guardian/unsubscribe?token=${valid}`)).status()).toBe(200)
    // The opt-out must land where send-guardian-notifications reads it.
    const svc = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await svc.from('profiles').select('notification_prefs').eq('uid', USERS.guardian.uid).single()
    expect((data?.notification_prefs as { guardian_emails?: boolean } | null)?.guardian_emails).toBe(false)
  })
})

test.describe('/api/health', () => {
  test('org admin only', async () => {
    covers('api:GET /api/health', 'api:POST /api/health')
    for (const method of ['get', 'post'] as const) {
      expect((await clients.get('anon')[method]('/api/health')).status()).toBe(401)
      expect((await clients.get('teacher')[method]('/api/health')).status()).toBe(403)
      expect((await clients.get('student')[method]('/api/health')).status()).toBe(403)
    }
    const res = await clients.get('admin').get('/api/health')
    expect(res.status()).toBe(200)
  })
})

test.describe('GET /api/search', () => {
  test('requires auth for real queries and never returns another tenant', async () => {
    covers('api:GET /api/search')
    expect((await clients.get('anon').get('/api/search?q=Suite')).status()).toBe(401)
    const res = await clients.get('student').get('/api/search?q=Beta')
    expect(res.status()).toBe(200)
    expect(JSON.stringify(await res.json())).not.toContain('Beta Course')
    const short = await clients.get('student').get('/api/search?q=a')
    expect(short.status()).toBe(200)
  })
})

test.describe('POST /api/upload/image', () => {
  test('staff only; only images; stored under the caller org', async () => {
    covers('api:POST /api/upload/image')
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')
    const image = { file: { name: 'suite.png', mimeType: 'image/png', buffer: png } }
    expect((await clients.get('anon').post('/api/upload/image', { multipart: image })).status()).toBe(401)
    expect((await clients.get('student').post('/api/upload/image', { multipart: image })).status()).toBe(403)
    const teacher = clients.get('teacher')
    const notImage = await teacher.post('/api/upload/image', {
      multipart: { file: { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') } },
    })
    expect(notImage.status()).toBe(415)
    expect((await teacher.post('/api/upload/image', { multipart: {} })).status()).toBe(400)
    const ok = await teacher.post('/api/upload/image', { multipart: image })
    expect(ok.status(), await ok.text()).toBe(200)
    const body = JSON.stringify(await ok.json())
    expect(body).toContain(USERS.teacher.org)
  })
})
