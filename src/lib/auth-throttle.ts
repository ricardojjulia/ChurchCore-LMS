import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'

// SERVER-ONLY (imports node:crypto and the service client).
// Postgres-backed limits for the auth endpoints (COUNCIL-2026-045). Keys are
// hashed before they reach the database, so no raw email or IP is stored.

export type ThrottleKind = 'ip' | 'email' | 'org'
export type SecurityEvent =
  | 'login_throttled' | 'login_failed' | 'captcha_failed'
  | 'join_throttled' | 'reset_requested' | 'reset_throttled' | 'password_changed'

// Limits per endpoint: [max hits, window in seconds].
export const LIMITS = {
  loginIp:     [30, 600],
  loginEmail:  [10, 900],
  forgotIp:    [10, 900],
  forgotEmail: [3, 3600],
  joinIp:      [10, 3600],
  joinOrg:     [60, 3600],
} as const satisfies Record<string, readonly [number, number]>

export function hashId(kind: ThrottleKind, value: string): string {
  return `${kind}:` + createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

export function clientIp(req: Pick<NextRequest, 'headers'> | Headers): string {
  // Test for a Headers object first: Next's headers() adapter also carries a
  // raw `headers` field (a plain object), so `'headers' in req` misleads.
  const headers = typeof (req as Headers).get === 'function' ? (req as Headers) : (req as Pick<NextRequest, 'headers'>).headers
  // x-real-ip first: it's set by the platform (Vercel) and can't be supplied
  // by the client. Vercel also overwrites x-forwarded-for, but other proxies
  // append to it, so its first entry is only a fallback.
  return headers.get('x-real-ip')?.trim() || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export interface ThrottleResult { allowed: boolean; retryAfter: number }

// Counts one hit. Fails open (allowed) if the database call itself fails, so
// an outage of the limiter never locks everyone out; Turnstile still applies.
export async function hit(scope: string, key: string, [max, windowSeconds]: readonly [number, number]): Promise<ThrottleResult> {
  const { data, error } = await createServiceClient()
    .rpc('auth_throttle_hit', { p_key: `${scope}|${key}`, p_max: max, p_window_seconds: windowSeconds })
  if (error) {
    console.warn('auth throttle unavailable:', error.code ?? 'unknown')
    return { allowed: true, retryAfter: 0 }
  }
  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; retry_after?: number } | null
  return { allowed: row?.allowed !== false, retryAfter: row?.retry_after ?? 0 }
}

export async function clear(scope: string, key: string): Promise<void> {
  await createServiceClient().rpc('auth_throttle_clear', { p_key: `${scope}|${key}` })
}

export async function recordEvent(event: SecurityEvent, ids: { ip?: string; email?: string } = {}): Promise<void> {
  const { error } = await createServiceClient().from('auth_security_events').insert({
    event,
    ip_hash: ids.ip ? hashId('ip', ids.ip) : null,
    email_hash: ids.email ? hashId('email', ids.email) : null,
  })
  if (error) console.warn('security event not recorded:', error.code ?? 'unknown')
}

export function minutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60))
}
