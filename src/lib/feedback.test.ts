/**
 * Feedback lib unit tests
 * Covers acceptance criteria: 1 (fingerprint determinism/non-collapse),
 *   2 (validateFeedbackPayload — every field bound)
 * Required env vars: none
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeForFingerprint,
  computeFingerprint,
  validateFeedbackPayload,
} from '@/lib/feedback'

// ── normalizeForFingerprint ────────────────────────────────────────────────────

describe('normalizeForFingerprint', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeForFingerprint('  hello  ')).toBe('hello')
  })

  it('lowercases the string', () => {
    expect(normalizeForFingerprint('Hello World')).toBe('hello world')
  })

  it('collapses multiple spaces to a single space', () => {
    expect(normalizeForFingerprint('hello   world')).toBe('hello world')
  })

  it('collapses tabs and newlines as whitespace', () => {
    expect(normalizeForFingerprint('hello\t\nworld')).toBe('hello world')
  })

  it('leaves an empty string empty', () => {
    expect(normalizeForFingerprint('')).toBe('')
  })
})

// ── computeFingerprint ────────────────────────────────────────────────────────

describe('computeFingerprint', () => {
  it('produces identical output for identical inputs', () => {
    const a = computeFingerprint('/dashboard', 'BUG', 'button does not work')
    const b = computeFingerprint('/dashboard', 'BUG', 'button does not work')
    expect(a).toBe(b)
  })

  it('is deterministic — whitespace variations normalize to the same hash', () => {
    const a = computeFingerprint('/dashboard', 'BUG', '  button   does  not   work  ')
    const b = computeFingerprint('/dashboard', 'BUG', 'button does not work')
    expect(a).toBe(b)
  })

  it('produces distinct hashes for materially different notes on the same route/category', () => {
    const a = computeFingerprint('/dashboard', 'BUG', 'button does not work')
    const b = computeFingerprint('/dashboard', 'BUG', 'page fails to load')
    expect(a).not.toBe(b)
  })

  it('produces distinct hashes when the route differs', () => {
    const a = computeFingerprint('/dashboard', 'BUG', 'error')
    const b = computeFingerprint('/profile', 'BUG', 'error')
    expect(a).not.toBe(b)
  })

  it('produces distinct hashes when the category differs', () => {
    const a = computeFingerprint('/dashboard', 'BUG', 'error')
    const b = computeFingerprint('/dashboard', 'IMPROVEMENT', 'error')
    expect(a).not.toBe(b)
  })

  it('returns a 64-character lowercase hex string (SHA-256)', () => {
    const hash = computeFingerprint('/any', 'BUG', 'detail')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ── validateFeedbackPayload ───────────────────────────────────────────────────

describe('validateFeedbackPayload', () => {
  // A baseline well-formed payload used across tests
  const VALID: Record<string, unknown> = {
    sessionId:              '11111111-1111-1111-1111-111111111111',
    route:                  '/dashboard',
    category:               'BUG',
    note:                   'Something is wrong',
    breadcrumbs:            ['/home', '/dashboard'],
    appVersion:             '1.0.0',
    sessionDurationSeconds: 120,
  }

  // ── Happy paths ─────────────────────────────────────────────────────────────

  it('accepts a fully-populated well-formed payload', () => {
    const result = validateFeedbackPayload(VALID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.sessionId).toBe(VALID.sessionId)
      expect(result.data.category).toBe('BUG')
      expect(result.data.note).toBe('Something is wrong')
    }
  })

  it('accepts a minimal payload (optional fields absent → null in output)', () => {
    const result = validateFeedbackPayload({
      sessionId:   '22222222-2222-2222-2222-222222222222',
      route:       '/login',
      category:    'IMPROVEMENT',
      breadcrumbs: [],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.errorMessage).toBeNull()
      expect(result.data.note).toBeNull()
      expect(result.data.appVersion).toBeNull()
      expect(result.data.sessionDurationSeconds).toBeNull()
    }
  })

  it('accepts all four valid categories', () => {
    for (const category of ['BUG', 'ERROR', 'UNEXPECTED_RESULT', 'IMPROVEMENT']) {
      expect(validateFeedbackPayload({ ...VALID, category }).ok).toBe(true)
    }
  })

  it('accepts errorMessage at exactly 500 characters', () => {
    expect(validateFeedbackPayload({ ...VALID, errorMessage: 'e'.repeat(500) }).ok).toBe(true)
  })

  it('accepts note at exactly 1000 characters', () => {
    expect(validateFeedbackPayload({ ...VALID, note: 'n'.repeat(1000) }).ok).toBe(true)
  })

  it('accepts sessionDurationSeconds at the boundaries (0 and 2592000)', () => {
    expect(validateFeedbackPayload({ ...VALID, sessionDurationSeconds: 0 }).ok).toBe(true)
    expect(validateFeedbackPayload({ ...VALID, sessionDurationSeconds: 2592000 }).ok).toBe(true)
  })

  // ── Body type guards ────────────────────────────────────────────────────────

  it('rejects null body', () => {
    const result = validateFeedbackPayload(null)
    expect(result.ok).toBe(false)
  })

  it('rejects non-object bodies (string, number, array)', () => {
    expect(validateFeedbackPayload('string').ok).toBe(false)
    expect(validateFeedbackPayload(42).ok).toBe(false)
    expect(validateFeedbackPayload([]).ok).toBe(false)
  })

  // ── sessionId ───────────────────────────────────────────────────────────────

  it('rejects sessionId that is not a valid UUID', () => {
    expect(validateFeedbackPayload({ ...VALID, sessionId: 'not-a-uuid' }).ok).toBe(false)
    expect(validateFeedbackPayload({ ...VALID, sessionId: '' }).ok).toBe(false)
    expect(validateFeedbackPayload({ ...VALID, sessionId: 12345 }).ok).toBe(false)
  })

  // ── route ───────────────────────────────────────────────────────────────────

  it('rejects an empty route', () => {
    expect(validateFeedbackPayload({ ...VALID, route: '' }).ok).toBe(false)
  })

  it('rejects a route exceeding 200 characters', () => {
    expect(validateFeedbackPayload({ ...VALID, route: '/' + 'a'.repeat(200) }).ok).toBe(false)
  })

  // ── category ────────────────────────────────────────────────────────────────

  it('rejects a category outside the allowlist', () => {
    expect(validateFeedbackPayload({ ...VALID, category: 'CRASH' }).ok).toBe(false)
    expect(validateFeedbackPayload({ ...VALID, category: 'bug' }).ok).toBe(false) // case-sensitive
    expect(validateFeedbackPayload({ ...VALID, category: '' }).ok).toBe(false)
    expect(validateFeedbackPayload({ ...VALID, category: null }).ok).toBe(false)
  })

  // ── errorMessage ────────────────────────────────────────────────────────────

  it('rejects errorMessage exceeding 500 characters', () => {
    expect(validateFeedbackPayload({ ...VALID, errorMessage: 'e'.repeat(501) }).ok).toBe(false)
  })

  it('rejects errorMessage that is not a string', () => {
    expect(validateFeedbackPayload({ ...VALID, errorMessage: 123 }).ok).toBe(false)
  })

  // ── note ─────────────────────────────────────────────────────────────────────

  it('rejects note exceeding 1000 characters', () => {
    expect(validateFeedbackPayload({ ...VALID, note: 'n'.repeat(1001) }).ok).toBe(false)
  })

  it('rejects note that is not a string', () => {
    expect(validateFeedbackPayload({ ...VALID, note: {} }).ok).toBe(false)
  })

  // ── breadcrumbs ─────────────────────────────────────────────────────────────

  it('rejects breadcrumbs with more than 5 items', () => {
    expect(validateFeedbackPayload({ ...VALID, breadcrumbs: ['/a', '/b', '/c', '/d', '/e', '/f'] }).ok).toBe(false)
  })

  it('rejects a breadcrumb string exceeding 200 characters', () => {
    expect(validateFeedbackPayload({ ...VALID, breadcrumbs: ['/' + 'a'.repeat(200)] }).ok).toBe(false)
  })

  it('rejects breadcrumbs that are not an array', () => {
    expect(validateFeedbackPayload({ ...VALID, breadcrumbs: 'not-array' }).ok).toBe(false)
    expect(validateFeedbackPayload({ ...VALID, breadcrumbs: null }).ok).toBe(false)
  })

  // ── appVersion ──────────────────────────────────────────────────────────────

  it('rejects appVersion exceeding 50 characters', () => {
    expect(validateFeedbackPayload({ ...VALID, appVersion: 'v'.repeat(51) }).ok).toBe(false)
  })

  // ── sessionDurationSeconds ──────────────────────────────────────────────────

  it('rejects negative sessionDurationSeconds', () => {
    expect(validateFeedbackPayload({ ...VALID, sessionDurationSeconds: -1 }).ok).toBe(false)
  })

  it('rejects sessionDurationSeconds exceeding 2592000', () => {
    expect(validateFeedbackPayload({ ...VALID, sessionDurationSeconds: 2592001 }).ok).toBe(false)
  })

  it('rejects non-integer sessionDurationSeconds', () => {
    expect(validateFeedbackPayload({ ...VALID, sessionDurationSeconds: 1.5 }).ok).toBe(false)
  })

  // ── Error message shape ─────────────────────────────────────────────────────

  it('always returns generic "Invalid request" error, never the failing field name', () => {
    const failingCases = [
      validateFeedbackPayload(null),
      validateFeedbackPayload({ ...VALID, sessionId: 'bad-uuid' }),
      validateFeedbackPayload({ ...VALID, category: 'CRASH' }),
      validateFeedbackPayload({ ...VALID, note: 'n'.repeat(1001) }),
    ]
    for (const result of failingCases) {
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('Invalid request')
    }
  })
})
