import { createHash, randomBytes } from 'node:crypto'

// Self-serve signup helpers (COUNCIL-2026-034): input validation, the
// verification token, and the feature flag. No I/O here, so it's unit-tested
// directly.

export const SIGNUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export function signupEnabled(): boolean {
  return process.env.SELF_SERVE_SIGNUP_ENABLED === 'true'
}

// Paths and names a church slug must never take: app routes and brand terms.
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'billing', 'callback', 'churchcore', 'dashboard', 'help',
  'join', 'login', 'logout', 'platform', 'settings', 'signup', 'start', 'support', 'verify', 'www',
])

// Common disposable-email domains. Not exhaustive: rate limits, Turnstile and
// the platform review queue are the other layers.
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'tempmail.com', 'temp-mail.org',
  'throwawaymail.com', 'trashmail.com', 'yopmail.com', 'getnada.com', 'sharklasers.com',
  'dispostable.com', 'maildrop.cc', 'fakeinbox.com', 'mintemail.com', 'spamgourmet.com',
])

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface SignupInput {
  churchName: string
  slug: string
  adminName: string
  email: string
  timezone: string
  locale: 'en' | 'es'
}

export type SignupValidation =
  | { ok: true; value: SignupInput }
  | { ok: false; field: keyof SignupInput | 'form'; code: string }

export { slugify } from './signup-slug'

export function emailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? ''
}

export function validateSignup(raw: Record<string, unknown>): SignupValidation {
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : '')
  const churchName = str('churchName')
  const slug = str('slug').toLowerCase()
  const adminName = str('adminName')
  const email = str('email').toLowerCase()
  const timezone = str('timezone') || 'America/New_York'
  const locale = raw.locale === 'es' ? 'es' : 'en'

  if (churchName.length < 2 || churchName.length > 100) return { ok: false, field: 'churchName', code: 'invalid' }
  if (!SLUG_RE.test(slug)) return { ok: false, field: 'slug', code: 'invalid' }
  if (RESERVED_SLUGS.has(slug)) return { ok: false, field: 'slug', code: 'reserved' }
  if (adminName.length < 2 || adminName.length > 100) return { ok: false, field: 'adminName', code: 'invalid' }
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, field: 'email', code: 'invalid' }
  if (DISPOSABLE_DOMAINS.has(emailDomain(email))) return { ok: false, field: 'email', code: 'disposable' }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
  } catch {
    return { ok: false, field: 'timezone', code: 'invalid' }
  }
  return { ok: true, value: { churchName, slug, adminName, email, timezone, locale } }
}

export function newSignupToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashSignupToken(token) }
}

export function hashSignupToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
