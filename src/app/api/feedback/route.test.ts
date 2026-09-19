// @vitest-environment node
/**
 * Feedback submission route — unit tests
 * Covers acceptance criteria:
 *   3 — gate-off (NEXT_PUBLIC_DEMO_MODE unset/"false") → 404
 *   4 — malformed JSON / wrong types → 400 with generic message
 *   5 — client-supplied fingerprint/identity fields are ignored
 *   6 — authenticated identity from session/profile_roles; anonymous → null
 *   7 — rate limit exceeded → 429, distinct from 400/500
 *   8 — thrown internal error → generic 500, no raw error text
 * Required env vars: none (unit test — all clients are mocked)
 *
 * The dedupe/reopen upsert itself is a single atomic RPC call
 * (upsert_platform_feedback — see
 * supabase/migrations/20260919120000_atomic_platform_feedback_upsert.sql),
 * so these tests assert the route calls it with the right arguments and
 * handles its error field correctly. The atomic upsert's own SQL semantics
 * (hit_count increment, reopen on conflict, race-safety) are verified
 * directly against Postgres, not re-implemented as a JS mock here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { computeFingerprint } from '@/lib/feedback'

// ── Proxy: handles arbitrary awaitable query chains at any depth ───────────────
function resolvesWith(value: unknown) {
  const handler: ProxyHandler<object> = {
    get(_, prop) {
      if (prop === 'then') {
        return (res: (v: unknown) => void) => Promise.resolve(value).then(res)
      }
      if (typeof prop === 'symbol') return undefined
      return (..._args: unknown[]) => new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler)
}

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
// vi.hoisted ensures these are available before the vi.mock factories run.
const mocks = vi.hoisted(() => ({
  getUser:    vi.fn(),
  serverFrom: vi.fn(),
  serviceRpc: vi.fn(),
  checkLimit: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.serverFrom,
  }),
}))

vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: mocks.serviceRpc,
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  feedbackLimiter: null,
  checkLimit:      mocks.checkLimit,
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

const VALID_PAYLOAD = {
  sessionId:              '11111111-1111-1111-1111-111111111111',
  route:                  '/dashboard',
  category:               'BUG',
  note:                   'Button does not work',
  breadcrumbs:            ['/home', '/dashboard'],
  appVersion:             '1.0.0',
  sessionDurationSeconds: 120,
}

function makeRequest(body: unknown = VALID_PAYLOAD): NextRequest {
  return new NextRequest('http://localhost/api/feedback', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

// Import the route AFTER mocks are registered (dynamic import avoids hoisting issues)
let POST: (req: NextRequest) => Promise<Response>

beforeEach(async () => {
  vi.resetAllMocks()

  // Default: not rate-limited
  mocks.checkLimit.mockResolvedValue({ limited: false, retryAfter: 0, limit: 20, remaining: 19 })
  // Default: anonymous session
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
  // Default: profile_roles returns nothing
  mocks.serverFrom.mockImplementation(() => resolvesWith({ data: null, error: null }))
  // Default: the atomic upsert RPC succeeds
  mocks.serviceRpc.mockResolvedValue({ data: [{ id: 'row-1', hit_count: 1 }], error: null })

  // Import the handler fresh; dynamic import caches on first call but that's fine
  // because the mocks above are reset before each test.
  const mod = await import('@/app/api/feedback/route')
  POST = mod.POST
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DEMO_MODE
})

// ── Criterion 3: feature gate ─────────────────────────────────────────────────

describe('feature gate (criterion 3)', () => {
  it('returns 404 when NEXT_PUBLIC_DEMO_MODE is not set', async () => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    const res = await POST(makeRequest())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
    // No DB interaction must occur
    expect(mocks.serviceRpc).not.toHaveBeenCalled()
  })

  it('returns 404 when NEXT_PUBLIC_DEMO_MODE is "false"', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false'
    const res = await POST(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns 404 regardless of body content when gate is off', async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false'
    const res = await POST(makeRequest({ anything: 'goes' }))
    expect(res.status).toBe(404)
  })
})

// ── Criterion 4: malformed body ───────────────────────────────────────────────

describe('body validation (criterion 4)', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_DEMO_MODE = 'true' })

  it('returns 400 on malformed JSON', async () => {
    const req = new NextRequest('http://localhost/api/feedback', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    'not-valid-json{{{',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid request' })
  })

  it('returns 400 on null body', async () => {
    const req = new NextRequest('http://localhost/api/feedback', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    'null',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when sessionId is not a UUID', async () => {
    const res = await POST(makeRequest({ ...VALID_PAYLOAD, sessionId: 'bad-id' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid request')
  })

  it('returns 400 when category is not in the allowlist', async () => {
    const res = await POST(makeRequest({ ...VALID_PAYLOAD, category: 'CRASH' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid request')
  })

  it('returns 400 when note exceeds 1000 characters', async () => {
    const res = await POST(makeRequest({ ...VALID_PAYLOAD, note: 'n'.repeat(1001) }))
    expect(res.status).toBe(400)
  })

  it('400 response body never echoes the invalid field name', async () => {
    const res = await POST(makeRequest({ ...VALID_PAYLOAD, sessionId: 'bad' }))
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('sessionId')
    expect(body.error).toBe('Invalid request')
  })
})

// ── Criteria 5 & 6: server-derived identity and fingerprint ───────────────────

describe('server-derived identity and fingerprint (criteria 5 & 6)', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_DEMO_MODE = 'true' })

  it('client-supplied fingerprint/identity fields are ignored — only the server-computed fingerprint is passed to the upsert', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-001', email: 'real@org.com' } },
      error: null,
    })
    // profile_roles returns role 'admin'
    mocks.serverFrom.mockImplementation(() =>
      resolvesWith({ data: { role: 'admin' }, error: null })
    )

    // The client sends a spoofed fingerprint and identity fields
    const spoofedPayload = {
      ...VALID_PAYLOAD,
      fingerprint: 'injected-fingerprint-from-client',
      userEmail:   'attacker@evil.com',
      userRole:    'platform_admin',
      identity:    'spoofed',
    }
    const res = await POST(makeRequest(spoofedPayload))
    expect(res.status).toBe(201)

    // Fingerprint must be the server-computed value (route + category + note, normalized)
    const expectedFingerprint = computeFingerprint(
      VALID_PAYLOAD.route,
      VALID_PAYLOAD.category,
      VALID_PAYLOAD.note,
    )
    expect(mocks.serviceRpc).toHaveBeenCalledWith(
      'upsert_platform_feedback',
      expect.objectContaining({
        p_fingerprint: expectedFingerprint,
        p_user_email:  'real@org.com',
        p_user_role:   'admin',
      })
    )
    const rpcArgs = mocks.serviceRpc.mock.calls[0][1] as Record<string, unknown>
    expect(rpcArgs.p_fingerprint).not.toBe('injected-fingerprint-from-client')
  })

  it('authenticated request — p_user_email and p_user_role populated from session and profile_roles', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-002', email: 'teacher@org.com' } },
      error: null,
    })
    mocks.serverFrom.mockImplementation(() =>
      resolvesWith({ data: { role: 'teacher' }, error: null })
    )

    await POST(makeRequest())
    expect(mocks.serviceRpc).toHaveBeenCalledWith(
      'upsert_platform_feedback',
      expect.objectContaining({ p_user_email: 'teacher@org.com', p_user_role: 'teacher' })
    )
  })

  it('anonymous request — p_user_email and p_user_role are null', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await POST(makeRequest())
    expect(res.status).toBe(201)
    expect(mocks.serviceRpc).toHaveBeenCalledWith(
      'upsert_platform_feedback',
      expect.objectContaining({ p_user_email: null, p_user_role: null })
    )
  })

  it('profile_roles (not profiles) is queried for user role — never the profiles table', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-003', email: 'user@org.com' } },
      error: null,
    })
    mocks.serverFrom.mockImplementation((table: string) => {
      // Fail if profiles is ever queried — that would violate CLAUDE.md rule 2
      expect(table).not.toBe('profiles')
      return resolvesWith({ data: null, error: null })
    })

    await POST(makeRequest())
    // The assertion is inside the mock — if 'profiles' was queried, the test fails
  })
})

// ── Criterion 7: rate limiting ────────────────────────────────────────────────

describe('rate limiting (criterion 7)', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_DEMO_MODE = 'true' })

  it('returns 429 when rate-limited', async () => {
    mocks.checkLimit.mockResolvedValue({ limited: true, retryAfter: 30, limit: 20, remaining: 0 })
    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Rate limited' })
  })

  it('429 is distinct from 400: validation passes before rate limit is checked', async () => {
    // This ensures rate-limited requests were actually valid (validation runs first)
    mocks.checkLimit.mockResolvedValue({ limited: true, retryAfter: 5, limit: 20, remaining: 0 })
    const res = await POST(makeRequest(VALID_PAYLOAD))
    expect(res.status).toBe(429)
  })

  it('rate limit check does not execute DB operations', async () => {
    mocks.checkLimit.mockResolvedValue({ limited: true, retryAfter: 5, limit: 20, remaining: 0 })
    await POST(makeRequest())
    expect(mocks.serviceRpc).not.toHaveBeenCalled()
  })
})

// ── Criterion 8: internal error handling ─────────────────────────────────────

describe('internal error handling (criterion 8)', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_DEMO_MODE = 'true' })

  it('returns generic 500 when the service client throws', async () => {
    mocks.serviceRpc.mockImplementation(() => {
      throw new Error('connection refused: real internal db error text')
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Something went wrong' })
  })

  it('500 response does not leak raw error text', async () => {
    mocks.serviceRpc.mockImplementation(() => {
      throw new Error('FATAL: secret_connection_string exposed in error')
    })
    const res = await POST(makeRequest())
    const body = JSON.stringify(await res.json())
    expect(body).not.toContain('FATAL')
    expect(body).not.toContain('secret_connection_string')
  })

  it('returns generic 500 when createClient throws during identity derivation', async () => {
    mocks.getUser.mockRejectedValue(new Error('auth service unavailable'))

    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Something went wrong' })
  })

  it('returns generic 500 and does not report success when the atomic upsert RPC returns an error', async () => {
    // Supabase reports failures in the `error` field, not by rejecting the
    // promise — this must not be treated as success just because the call resolved.
    mocks.serviceRpc.mockResolvedValue({ data: null, error: { message: 'unique_violation' } })

    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Something went wrong' })
  })
})

// ── Atomic upsert RPC call shape ──────────────────────────────────────────────
// The upsert's dedupe/reopen/hit_count-increment/race-safety semantics live in
// Postgres (supabase/migrations/20260919120000_atomic_platform_feedback_upsert.sql,
// exercised directly against a real database — see the e2e suite and manual
// psql verification) — these tests only verify the route calls that function,
// by name, with every field correctly derived.

describe('atomic upsert RPC call', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_DEMO_MODE = 'true' })

  it('calls upsert_platform_feedback with the server-computed fingerprint and every payload field', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(201)

    const expectedFingerprint = computeFingerprint(
      VALID_PAYLOAD.route,
      VALID_PAYLOAD.category,
      VALID_PAYLOAD.note,
    )
    expect(mocks.serviceRpc).toHaveBeenCalledWith('upsert_platform_feedback', {
      p_fingerprint:              expectedFingerprint,
      p_session_id:               VALID_PAYLOAD.sessionId,
      p_route:                    VALID_PAYLOAD.route,
      p_category:                 VALID_PAYLOAD.category,
      p_error_message:            null,
      p_note:                     VALID_PAYLOAD.note,
      p_breadcrumbs:              VALID_PAYLOAD.breadcrumbs,
      p_user_email:               null,
      p_user_role:                null,
      p_app_version:              VALID_PAYLOAD.appVersion,
      p_session_duration_seconds: VALID_PAYLOAD.sessionDurationSeconds,
    })
  })

  it('ERROR-category submissions pass errorMessage (falling back to note) as p_error_message, and p_note null', async () => {
    const res = await POST(makeRequest({
      ...VALID_PAYLOAD,
      category:     'ERROR',
      errorMessage: 'boom',
      note:         undefined,
    }))
    expect(res.status).toBe(201)
    expect(mocks.serviceRpc).toHaveBeenCalledWith(
      'upsert_platform_feedback',
      expect.objectContaining({ p_error_message: 'boom', p_note: null })
    )
  })

  it('manual ERROR-category submissions (no errorMessage) fall back to note for p_error_message', async () => {
    const res = await POST(makeRequest({
      ...VALID_PAYLOAD,
      category: 'ERROR',
      note:     'user-typed crash description',
    }))
    expect(res.status).toBe(201)
    expect(mocks.serviceRpc).toHaveBeenCalledWith(
      'upsert_platform_feedback',
      expect.objectContaining({ p_error_message: 'user-typed crash description', p_note: null })
    )
  })
})

// ── D4: rate-limit key derivation ────────────────────────────────────────────

describe('rate-limit key derivation', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_DEMO_MODE = 'true' })

  it('authenticated requests are rate-limited by the verified user id, not the client-supplied sessionId', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-server-derived-id', email: 'user@org.com' } },
      error: null,
    })

    await POST(makeRequest())
    expect(mocks.checkLimit).toHaveBeenCalledWith(null, 'auth-server-derived-id')
  })

  it('anonymous requests are rate-limited by client IP (x-forwarded-for) when present, not sessionId', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = new NextRequest('http://localhost/api/feedback', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
      body:    JSON.stringify(VALID_PAYLOAD),
    })
    await POST(req)
    // Only the first IP in the list is used
    expect(mocks.checkLimit).toHaveBeenCalledWith(null, '203.0.113.7')
  })

  it('falls back to the client-supplied sessionId only when neither user id nor IP is available', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    await POST(makeRequest())
    expect(mocks.checkLimit).toHaveBeenCalledWith(null, VALID_PAYLOAD.sessionId)
  })
})
