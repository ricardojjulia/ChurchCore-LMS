import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import { turnstileConfigured, verifyTurnstile } from '@/lib/turnstile'
import { LIMITS, clientIp, hashId, hit, recordEvent } from '@/lib/auth-throttle'
import { siteBaseUrl } from '@/lib/site-url'
import PasswordResetEmail from '@/emails/PasswordResetEmail'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SENT = { ok: true, message: 'If an account uses that email, we’ve sent a link to reset the password.' }

// Password reset request (COUNCIL-2026-045). The answer is the same whether
// or not an account exists. The link is sent by the app (Resend), not by
// Supabase's mailer, and points at /auth/reset on this site.
export async function POST(req: NextRequest) {
  const baseUrl = siteBaseUrl()
  if (!baseUrl || !process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'Password reset by email isn’t available on this site yet. Ask your church administrator for help.', code: 'unavailable' },
      { status: 503 },
    )
  }

  const ip = clientIp(req)
  const ipLimit = await hit('forgot', hashId('ip', ip), LIMITS.forgotIp)
  if (!ipLimit.allowed) {
    await recordEvent('reset_throttled', { ip })
    return NextResponse.json({ error: 'Too many requests. Please try again later.', code: 'too_many' }, { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfter) } })
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Enter a valid email address.', code: 'invalid_email' }, { status: 400 })
  }
  if (turnstileConfigured() && !(await verifyTurnstile(typeof body?.turnstileToken === 'string' ? body.turnstileToken : null, ip))) {
    await recordEvent('captcha_failed', { ip })
    return NextResponse.json({ error: 'Security check failed. Please try again.', code: 'captcha' }, { status: 400 })
  }

  // Past the per-email limit, answer as if sent: saying otherwise would
  // confirm the address is being targeted, and nothing more is mailed.
  const emailLimit = await hit('forgot', hashId('email', email), LIMITS.forgotEmail)
  if (!emailLimit.allowed) {
    await recordEvent('reset_throttled', { ip, email })
    return NextResponse.json(SENT)
  }

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('uid').ilike('email', email).limit(1).maybeSingle()
  if (profile) {
    const { data: link } = await service.auth.admin.generateLink({ type: 'recovery', email })
    const tokenHash = link?.properties?.hashed_token
    if (tokenHash) {
      const { sendEmail } = await import('@/lib/email')
      const locale = body?.locale === 'es' ? 'es' : 'en'
      try {
        await sendEmail({
          to: email,
          subject: locale === 'es' ? 'Restablece tu contraseña' : 'Reset your password',
          react: PasswordResetEmail({ actionUrl: `${baseUrl}/auth/reset?token_hash=${encodeURIComponent(tokenHash)}`, locale }),
        })
      } catch {
        console.warn('password reset email failed to send')
      }
      await recordEvent('reset_requested', { ip, email })
    }
  }
  return NextResponse.json(SENT)
}
