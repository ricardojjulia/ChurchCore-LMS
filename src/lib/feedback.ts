import { createHash } from 'node:crypto'

// ─── Category enum ────────────────────────────────────────────────────────────

export const FEEDBACK_CATEGORIES = ['BUG', 'ERROR', 'UNEXPECTED_RESULT', 'IMPROVEMENT'] as const
export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number]

// ─── Fingerprint helpers ──────────────────────────────────────────────────────

/** Trim, lowercase, and collapse internal whitespace runs to a single space. */
export function normalizeForFingerprint(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Compute a deterministic SHA-256 fingerprint from the three dedupe fields.
 * The fingerprint is always computed server-side — never accepted from the client.
 */
export function computeFingerprint(
  route:    string,
  category: string,
  detail:   string,
): string {
  const normalized = [route, category, detail].map(normalizeForFingerprint).join('|')
  return createHash('sha256').update(normalized).digest('hex')
}

// ─── Payload validation ───────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ValidatedFeedbackPayload {
  sessionId:               string
  route:                   string
  category:                FeedbackCategory
  errorMessage:            string | null
  note:                    string | null
  breadcrumbs:             string[]
  appVersion:              string | null
  sessionDurationSeconds:  number | null
}

type ValidationResult =
  | { ok: true;  data: ValidatedFeedbackPayload }
  | { ok: false; error: string }

/**
 * Validate the raw request body for a feedback submission.
 * Returns generic 'Invalid request' on any structural problem — we intentionally
 * do not echo back which field failed to avoid giving submission-format hints.
 * (CLAUDE.md: "never return DB errors directly to the client")
 */
export function validateFeedbackPayload(body: unknown): ValidationResult {
  const INVALID: ValidationResult = { ok: false, error: 'Invalid request' }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) return INVALID

  // Cast to a loose record for field access — fields are individually validated below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = body as Record<string, any>

  // sessionId — required, UUID format
  if (typeof b.sessionId !== 'string' || !UUID_RE.test(b.sessionId)) return INVALID

  // route — required string, ≤ 200 chars
  if (typeof b.route !== 'string' || b.route.length === 0 || b.route.length > 200) return INVALID

  // category — required, must be in the allowlist
  if (!FEEDBACK_CATEGORIES.includes(b.category)) return INVALID

  // errorMessage — optional string ≤ 500 chars
  if (b.errorMessage !== undefined && b.errorMessage !== null) {
    if (typeof b.errorMessage !== 'string' || b.errorMessage.length > 500) return INVALID
  }

  // note — optional string ≤ 1000 chars
  if (b.note !== undefined && b.note !== null) {
    if (typeof b.note !== 'string' || b.note.length > 1000) return INVALID
  }

  // breadcrumbs — array of ≤ 5 strings, each ≤ 200 chars
  if (!Array.isArray(b.breadcrumbs)) return INVALID
  if (b.breadcrumbs.length > 5) return INVALID
  for (const crumb of b.breadcrumbs) {
    if (typeof crumb !== 'string' || crumb.length > 200) return INVALID
  }

  // appVersion — optional string ≤ 50 chars
  if (b.appVersion !== undefined && b.appVersion !== null) {
    if (typeof b.appVersion !== 'string' || b.appVersion.length > 50) return INVALID
  }

  // sessionDurationSeconds — optional integer 0–2592000 or null
  if (b.sessionDurationSeconds !== undefined && b.sessionDurationSeconds !== null) {
    if (
      typeof b.sessionDurationSeconds !== 'number' ||
      !Number.isInteger(b.sessionDurationSeconds) ||
      b.sessionDurationSeconds < 0 ||
      b.sessionDurationSeconds > 2592000
    ) return INVALID
  }

  return {
    ok:   true,
    data: {
      sessionId:              b.sessionId,
      route:                  b.route,
      category:               b.category as FeedbackCategory,
      errorMessage:           b.errorMessage ?? null,
      note:                   b.note ?? null,
      breadcrumbs:            b.breadcrumbs as string[],
      appVersion:             b.appVersion ?? null,
      sessionDurationSeconds: b.sessionDurationSeconds ?? null,
    },
  }
}
