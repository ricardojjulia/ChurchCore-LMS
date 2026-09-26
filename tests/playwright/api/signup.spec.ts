// COUNCIL-2026-034 — self-serve signup API.
//
// The suite has no email provider, so POST /api/signup can't complete the
// happy path here (it returns 503 once validation passes; the success branch
// is unit-tested with a mocked sender). The verify link is exercised end to
// end by staging a pending signup with a known token.
import { createHash, randomBytes } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { covers } from '../fixtures/covers'
import { ORG_A_SLUG } from '../fixtures/data'
import { USERS } from '../fixtures/roles'
import { db, runTag } from '../fixtures/db'
import { actorClients, DB_LEAK } from './client'

const clients = actorClients(['anon'])
test.beforeAll(() => clients.open())
test.afterAll(() => clients.close())

const valid = (over: Record<string, unknown> = {}) => ({
  churchName: 'Suite Signup Church', slug: `suite-${Date.now().toString(36)}`, adminName: 'Suite Admin',
  email: `suite-signup-${Date.now().toString(36)}@example.org`, timezone: 'America/Chicago', locale: 'en',
  turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX', ...over,
})

test.describe('POST /api/signup', () => {
  test('validates every field and refuses taken or reserved slugs', async () => {
    covers('api:POST /api/signup')
    const post = (data: Record<string, unknown>) => clients.get('anon').post('/api/signup', { data })
    expect((await post(valid({ turnstileToken: '' }))).status()).toBe(400)
    for (const [field, value] of [
      ['churchName', 'x'], ['slug', 'Has Spaces'], ['slug', 'admin'], ['adminName', ''],
      ['email', 'not-an-email'], ['email', 'someone@mailinator.com'], ['timezone', 'Mars/Olympus'],
    ] as const) {
      const res = await post(valid({ [field]: value }))
      expect(res.status(), `${field}=${value}`).toBe(400)
      expect((await res.json()).field).toBe(field)
    }
    const taken = await post(valid({ slug: ORG_A_SLUG }))
    expect(taken.status()).toBe(409)
    expect(await taken.json()).toMatchObject({ error: 'slug_taken', field: 'slug' })
  })

  test('responds identically whether or not the email has an account (no enumeration)', async () => {
    const post = (data: Record<string, unknown>) => clients.get('anon').post('/api/signup', { data })
    const known = await post(valid({ email: USERS.admin.email }))
    const unknown = await post(valid())
    // With no email provider in the suite both end at 503 — the point is that
    // the two responses are indistinguishable.
    expect(known.status()).toBe(unknown.status())
    expect(await known.text()).toBe(await unknown.text())
    expect(await unknown.text()).not.toMatch(DB_LEAK)
  })
})

test.describe('GET /api/signup/verify', () => {
  test('provisions the church once from a valid link; bad and reused links go back to /start', async () => {
    covers('api:GET /api/signup/verify')
    const anon = clients.get('anon')
    const bad = await anon.get('/api/signup/verify?token=nope', { maxRedirects: 0 })
    expect(bad.status()).toBe(307)
    expect(bad.headers()['location']).toBe('/start?error=invalid_link')

    const tag = runTag().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const slug = `s-${tag}`.slice(0, 40).replace(/-+$/, '')
    const email = `suite-${tag}@test.churchcore.dev`
    const token = randomBytes(32).toString('base64url')
    await db().from('pending_signups').insert({
      token_hash: createHash('sha256').update(token).digest('hex'),
      email, slug, expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      payload: { churchName: 'Suite Verified Church', slug, adminName: 'Suite Verified Admin', email, timezone: 'America/Chicago', locale: 'es' },
    })

    const ok = await anon.get(`/api/signup/verify?token=${token}`, { maxRedirects: 0 })
    expect(ok.status()).toBe(307)
    expect(ok.headers()['location']).toBe('/onboarding')
    expect(ok.headers()['set-cookie'] ?? '').toContain('auth-token')

    const { data: org } = await db().from('organizations')
      .select('id, status, signup_source, trial_ends_at, settings').eq('slug', slug).single()
    expect(org).toMatchObject({ status: 'trial', signup_source: 'self_serve' })
    expect(Date.parse(org!.trial_ends_at!) - Date.now()).toBeGreaterThan(13 * 86_400_000)
    expect((org!.settings as { locale?: string }).locale).toBe('es')
    const { data: admin } = await db().from('profiles').select('role, org_id, display_name, auth_id').eq('email', email).single()
    expect(admin).toMatchObject({ role: 'admin', org_id: org!.id, display_name: 'Suite Verified Admin' })

    const reused = await anon.get(`/api/signup/verify?token=${token}`, { maxRedirects: 0 })
    expect(reused.headers()['location']).toBe('/start?error=invalid_link')

    await db().auth.admin.deleteUser(admin!.auth_id)
    await db().from('organizations').delete().eq('id', org!.id)
  })
})
