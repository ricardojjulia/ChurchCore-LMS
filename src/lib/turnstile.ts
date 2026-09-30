// Cloudflare Turnstile server-side verification, shared by the public forms
// (/join registration and /start signup). Fails closed on any error.
export async function verifyTurnstile(token: string | null | undefined, remoteIp?: string | null): Promise<boolean> {
  if (!token) return false
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY ?? '', response: token })
    if (remoteIp) body.set('remoteip', remoteIp)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}

// Whether this deployment has Turnstile keys. Sign-in and password reset skip
// the check when it doesn't, so a missing key can never lock everyone out;
// their rate limits still apply (COUNCIL-2026-045). Registration forms
// (/join, /start) always require it.
export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
}
