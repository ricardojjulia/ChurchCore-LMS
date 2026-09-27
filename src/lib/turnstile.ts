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
