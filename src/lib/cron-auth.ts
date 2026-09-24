import { createHash, timingSafeEqual } from 'node:crypto'

// Scheduler-only endpoints (cron jobs, Edge Functions calling back into the app).
// Fails closed: when CRON_SECRET is not configured, every request is rejected.
// Accepts `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`.
export function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const header = req.headers.get('x-cron-secret') ?? ''
  return [bearer, header].some((candidate) => safeEqual(candidate, secret))
}

// Compare fixed-length digests so the timing reveals nothing, not even
// whether the candidate has the secret's length.
function safeEqual(a: string, b: string): boolean {
  const digest = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(digest(a), digest(b))
}
