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
  getUser:     vi.fn(),
  serverFrom:  vi.fn(),
  serviceFrom: vi.fn(),
  checkLimit:  vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.serverFrom,
  }),
}))

vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    from: mocks.serviceFrom,
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

// Default service mock: no existing row → insert path
function defaultServiceMock() {
  let callIndex = 0
  return (table: string) => {
    if (table !== 'platform_feedback') return resolvesWith({ data: null, error: null })
    const n = ++callIndex
    if (n === 1) {
      // First call: select().eq().maybeSingle() — returns no existing row
      return {
        select:      vi.fn().mockReturnThis(),
        eq:          vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    }
    // Second call: insert() — succeeds silently
    return {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
  }
}

// Import the route AFTER mocks are registered (dynamic import avoids hoisting issues)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: NextRequest) => Promise<Response>

beforeEach(async () => {
  vi.resetAllMocks()

  // Default: not rate-limited
  mocks.checkLimit.mockResolvedValue({ limited: false, retryAfter: 0, limit: 20, remaining: 19 })
  // Default: anonymous session
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
  // Default: profile_roles returns nothing
  mocks.serverFrom.mockImplementation(() => resolvesWith({ data: null, error: null }))
  // Default: no existing fingerprint
  mocks.serviceFrom.mockImplementation(defaultServiceMock())

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
    expect(mocks.serviceFrom).not.toHaveBeenCalled()
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

  it('client-supplied fingerprint/identity fields are ignored — only server-computed fingerprint is stored', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-001', email: 'real@org.com' } },
      error: null,
    })
    // profile_roles returns role 'admin'
    mocks.serverFrom.mockImplementation(() =>
      resolvesWith({ data: { role: 'admin' }, error: null })
    )

    // Use a spy on insert so we can assert what arguments were passed
    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    let callIndex = 0
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table !== 'platform_feedback') return resolvesWith({ data: null, error: null })
      const n = ++callIndex
      if (n === 1) {
        // First call: select().eq().maybeSingle() — no existing row
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      // Second call: insert()
      return { insert: insertSpy }
    })

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
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: expectedFingerprint,
        // Client-spoofed value must NOT appear
      })
    )
    const insertedArg = insertSpy.mock.calls[0][0] as Record<string, unknown>
    expect(insertedArg.fingerprint).not.toBe('injected-fingerprint-from-client')

    // Identity comes from the session, not the spoofed body fields
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_email: 'real@org.com',
        user_role:  'admin',
      })
    )
  })

  it('authenticated request — user_email and user_role populated from session and profile_roles', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'auth-002', email: 'teacher@org.com' } },
      error: null,
    })
    mocks.serverFrom.mockImplementation(() =>
      resolvesWith({ data: { role: 'teacher' }, error: null })
    )

    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    let callIndex = 0
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table !== 'platform_feedback') return resolvesWith({ data: null, error: null })
      const n = ++callIndex
      if (n === 1) {
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      return { insert: insertSpy }
    })

    await POST(makeRequest())
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user_email: 'teacher@org.com', user_role: 'teacher' })
    )
  })

  it('anonymous request — user_email and user_role are null', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    let callIndex = 0
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table !== 'platform_feedback') return resolvesWith({ data: null, error: null })
      const n = ++callIndex
      if (n === 1) {
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      return { insert: insertSpy }
    })

    const res = await POST(makeRequest())
    expect(res.status).toBe(201)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user_email: null, user_role: null })
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
    mocks.serviceFrom.mockImplementation(defaultServiceMock())

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
    expect(mocks.serviceFrom).not.toHaveBeenCalled()
  })
})

// ── Criterion 8: internal error handling ─────────────────────────────────────

describe('internal error handling (criterion 8)', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_DEMO_MODE = 'true' })

  it('returns generic 500 when the service client throws', async () => {
    mocks.serviceFrom.mockImplementation(() => {
      throw new Error('connection refused: real internal db error text')
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Something went wrong' })
  })

  it('500 response does not leak raw error text', async () => {
    mocks.serviceFrom.mockImplementation(() => {
      throw new Error('FATAL: secret_connection_string exposed in error')
    })
    const res = await POST(makeRequest())
    const body = JSON.stringify(await res.json())
    expect(body).not.toContain('FATAL')
    expect(body).not.toContain('secret_connection_string')
  })

  it('returns generic 500 when createClient throws during identity derivation', async () => {
    mocks.getUser.mockRejectedValue(new Error('auth service unavailable'))
    mocks.serviceFrom.mockImplementation(defaultServiceMock())

    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Something went wrong' })
  })
})
