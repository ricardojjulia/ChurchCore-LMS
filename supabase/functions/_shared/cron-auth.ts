// Shared auth for scheduler-invoked functions (COUNCIL-2026-031 finding).
//
// Fails CLOSED: if CRON_SECRET is not configured, every request is rejected.
// The previous per-function checks failed open — `if (secret && …)` let all
// callers through when the secret was unset, and comparing against
// `Bearer ${CRON_SECRET}` accepted the literal "Bearer undefined".
//
// Accepts `Authorization: Bearer <CRON_SECRET>` (pg_cron / net.http_post, see
// scripts/register-guardian-cron.sh) or `x-cron-secret: <CRON_SECRET>`.
export function rejectUnlessCron(req: Request): Response | null {
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  const auth = req.headers.get('Authorization') ?? ''
  const provided = req.headers.get('x-cron-secret')
    ?? (auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '')
  if (!secret || !timingSafeEqual(provided, secret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

// For functions only other backend code should call. The gateway's verify_jwt
// accepts any valid project JWT — including the public anon key — so the
// function itself must insist on the service role.
export function rejectUnlessServiceRole(req: Request): Response | null {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : ''
  if (!serviceKey || !timingSafeEqual(token, serviceKey)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}

// Mirror of src/lib/email.ts#isDeliverableAddress for Edge Functions: never
// send to reserved domains (the production synthetic tenant uses .invalid).
const UNDELIVERABLE_TLDS = ['.invalid', '.test', '.example', '.localhost']
export function isDeliverableAddress(email: string | null | undefined): email is string {
  if (!email) return false
  const domain = email.trim().toLowerCase().split('@')[1] ?? ''
  if (!domain) return false
  return !UNDELIVERABLE_TLDS.some((tld) => domain === tld.slice(1) || domain.endsWith(tld))
}
