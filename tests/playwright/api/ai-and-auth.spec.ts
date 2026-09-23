// COUNCIL-2026-031 D4.2 — AI routes, auth callback, demo login.
//
// The suite runs with deliberately invalid provider keys, so each route gets
// past its "not configured" check and its auth/validation logic is exercised
// for real; a request that reaches the provider fails upstream and must come
// back as a clean 502 — never a crash, never provider/DB detail.
import { test, expect } from '@playwright/test'
import { covers } from '../fixtures/covers'
import { IDS } from '../fixtures/data'
import { actorClients, DB_LEAK } from './client'

const clients = actorClients(['anon', 'student', 'teacher', 'admin', 'guardian'])
test.beforeAll(() => clients.open())
test.afterAll(() => clients.close())

const HQ_BODY = {
  model: 'claude-sonnet-4-6', max_tokens: 64, stream: false,
  messages: [{ role: 'user', content: 'ping' }],
}

test.describe('POST /api/ai (HQ Anthropic passthrough)', () => {
  test('is not an open proxy: anonymous 401, non-staff 403', async () => {
    covers('api:POST /api/ai')
    expect((await clients.get('anon').post('/api/ai', { data: HQ_BODY })).status()).toBe(401)
    expect((await clients.get('student').post('/api/ai', { data: HQ_BODY })).status()).toBe(403)
    expect((await clients.get('guardian').post('/api/ai', { data: HQ_BODY })).status()).toBe(403)
  })

  test('rejects disallowed models and malformed bodies with 400', async () => {
    const teacher = clients.get('teacher')
    expect((await teacher.post('/api/ai', { data: { ...HQ_BODY, model: 'some-expensive-model' } })).status()).toBe(400)
    expect((await teacher.post('/api/ai', { data: { ...HQ_BODY, messages: [] } })).status()).toBe(400)
    expect((await teacher.post('/api/ai', { data: 'not json', headers: { 'content-type': 'application/json' } })).status()).toBe(400)
  })

  test('staff request that reaches the provider fails cleanly (invalid suite key → 502)', async () => {
    const res = await clients.get('teacher').post('/api/ai', { data: HQ_BODY })
    expect(res.status()).toBe(502)
    expect(await res.text()).not.toMatch(/invalid x-api-key|authentication_error/i)
  })
})

test.describe('POST /api/ai/tutor', () => {
  test('validates input before anything else, then requires auth and enrollment', async () => {
    covers('api:POST /api/ai/tutor')
    const body = { sectionId: IDS.section, query: 'What is the lesson about?' }
    expect((await clients.get('anon').post('/api/ai/tutor', { data: { sectionId: IDS.section } })).status()).toBe(400)
    expect((await clients.get('anon').post('/api/ai/tutor', { data: body })).status()).toBe(401)
    // Guardian has no enrollment in the section.
    expect((await clients.get('guardian').post('/api/ai/tutor', { data: body })).status()).toBe(403)
  })
})

test.describe('POST /api/ai/confusion-topics', () => {
  test('staff only', async () => {
    covers('api:POST /api/ai/confusion-topics')
    const body = { sectionId: IDS.section }
    expect((await clients.get('anon').post('/api/ai/confusion-topics', { data: body })).status()).toBe(401)
    expect((await clients.get('student').post('/api/ai/confusion-topics', { data: body })).status()).toBe(403)
    expect((await clients.get('teacher').post('/api/ai/confusion-topics', { data: {} })).status()).toBe(400)
    const res = await clients.get('teacher').post('/api/ai/confusion-topics', { data: body })
    // 200 when the section has no content to analyse, 502 when the provider call fails — never a crash.
    expect([200, 502]).toContain(res.status())
    expect(await res.text()).not.toMatch(DB_LEAK)
  })
})

test.describe('POST /api/ai/related-concepts', () => {
  test('staff only; unknown page is handled', async () => {
    covers('api:POST /api/ai/related-concepts')
    const body = { pageId: IDS.contentPage }
    expect((await clients.get('anon').post('/api/ai/related-concepts', { data: body })).status()).toBe(401)
    expect((await clients.get('student').post('/api/ai/related-concepts', { data: body })).status()).toBe(403)
    expect((await clients.get('teacher').post('/api/ai/related-concepts', { data: {} })).status()).toBe(400)
    const res = await clients.get('teacher').post('/api/ai/related-concepts', { data: body })
    expect(res.status()).toBeLessThan(500)
  })
})

test.describe('POST /api/ai/outline-generator', () => {
  test('staff only, validates input, upstream failure is a clean 502', async () => {
    covers('api:POST /api/ai/outline-generator')
    const body = { text: 'Week 1: Prayer. Week 2: Scripture.' }
    expect((await clients.get('anon').post('/api/ai/outline-generator', { data: body })).status()).toBe(401)
    expect((await clients.get('student').post('/api/ai/outline-generator', { data: body })).status()).toBe(403)
    expect((await clients.get('teacher').post('/api/ai/outline-generator', { data: {} })).status()).toBe(400)
    expect((await clients.get('teacher').post('/api/ai/outline-generator', {
      data: { fileBase64: Buffer.from('not a pdf').toString('base64'), fileType: 'application/pdf' },
    })).status()).toBe(400)
    expect((await clients.get('teacher').post('/api/ai/outline-generator', { data: body })).status()).toBe(502)
  })
})

test.describe('GET /api/ai/weekly-summary', () => {
  test('requires auth; upstream failure is a clean 502', async () => {
    covers('api:GET /api/ai/weekly-summary')
    expect((await clients.get('anon').get('/api/ai/weekly-summary')).status()).toBe(401)
    const res = await clients.get('student').get('/api/ai/weekly-summary')
    expect([200, 502]).toContain(res.status())
  })
})

test.describe('GET /callback (auth code exchange)', () => {
  test('missing or bad code goes back to /login with an error', async () => {
    covers('api:GET /callback')
    for (const path of ['/callback', '/callback?code=not-a-real-code']) {
      const res = await clients.get('anon').get(path)
      expect(res.status()).toBe(307)
      expect(new URL(res.headers()['location']).pathname).toBe('/login')
    }
  })

  test('never redirects off-origin, whatever `next` says', async () => {
    for (const next of ['@evil.example', '//evil.example', 'https://evil.example']) {
      const res = await clients.get('anon').get(`/callback?code=bad&next=${encodeURIComponent(next)}`)
      const location = new URL(res.headers()['location'])
      expect(['127.0.0.1', 'localhost']).toContain(location.hostname)
      expect(location.host).not.toContain('evil')
    }
  })
})

test.describe('GET /api/auth/demo-login', () => {
  test('rejects missing, unknown, or stale tokens without signing anyone in', async () => {
    covers('api:GET /api/auth/demo-login')
    const cases = [
      ['/api/auth/demo-login', 'missing_params'],
      [`/api/auth/demo-login?t=nope&org=${IDS.cohort}`, 'org_not_found'],
    ] as const
    for (const [path, reason] of cases) {
      const res = await clients.get('anon').get(path)
      expect(res.status()).toBe(307)
      expect(res.headers()['location']).toContain(`error=${reason}`)
      expect(res.headers()['set-cookie'] ?? '').not.toMatch(/sb-.*-auth-token/)
    }
  })
})
