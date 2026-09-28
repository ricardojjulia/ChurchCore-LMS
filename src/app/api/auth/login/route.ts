import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { turnstileConfigured, verifyTurnstile } from '@/lib/turnstile'
import { LIMITS, clear, clientIp, hashId, hit, minutes, recordEvent } from '@/lib/auth-throttle'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const GENERIC = 'Email or password is incorrect.'

// Password sign-in (COUNCIL-2026-045). Server-side so the limits and the bot
// check can't be skipped by the page. Every credential failure — unknown
// email, wrong password, unconfirmed email — gets the same answer.
export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const ipLimit = await hit('login', hashId('ip', ip), LIMITS.loginIp)
  if (!ipLimit.allowed) {
    await recordEvent('login_throttled', { ip })
    return tooMany(ipLimit.retryAfter)
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!EMAIL_RE.test(email) || email.length > 254 || !password || password.length > 200) {
    return NextResponse.json({ error: 'Enter your email and password.', code: 'invalid_input' }, { status: 400 })
  }

  if (turnstileConfigured() && !(await verifyTurnstile(typeof body?.turnstileToken === 'string' ? body.turnstileToken : null, ip))) {
    await recordEvent('captcha_failed', { ip })
    return NextResponse.json({ error: 'Security check failed. Please try again.', code: 'captcha' }, { status: 400 })
  }

  // Per-email limit: slows password guessing against one account from many IPs.
  const emailKey = hashId('email', email)
  const emailLimit = await hit('login', emailKey, LIMITS.loginEmail)
  if (!emailLimit.allowed) {
    await recordEvent('login_throttled', { ip, email })
    return tooMany(emailLimit.retryAfter)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    await recordEvent('login_failed', { ip, email })
    // Supabase Auth's own limit also applies; surface it as ours.
    if (error.status === 429) return tooMany(60)
    return NextResponse.json({ error: GENERIC, code: 'invalid_credentials' }, { status: 401 })
  }
  await clear('login', emailKey)
  return NextResponse.json({ ok: true })
}

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: `Too many sign-in attempts. Try again in ${minutes(retryAfter)} minute${minutes(retryAfter) === 1 ? '' : 's'}.`, code: 'too_many', minutes: minutes(retryAfter) },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  )
}
