import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import { verifyTurnstile } from '@/lib/turnstile'
import { checkLimit, signupDomainLimiter, signupIpLimiter } from '@/lib/rate-limit'
import { emailDomain, newSignupToken, signupEnabled, SIGNUP_TOKEN_TTL_MS, validateSignup } from '@/lib/signup'
import SignupVerifyEmail from '@/emails/SignupVerifyEmail'
import { siteBaseUrl } from '@/lib/site-url'

export const runtime = 'nodejs'

// Public self-serve signup (COUNCIL-2026-034). Nothing is provisioned here:
// this only stages a pending signup and emails a verification link. The
// response is identical whether or not the email already has an account.
// Links in emails come from configuration (see siteBaseUrl).

export async function POST(req: NextRequest) {
  if (!signupEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const baseUrl = siteBaseUrl()
  if (!baseUrl) return NextResponse.json({ error: 'Signup is not configured.' }, { status: 503 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const ipLimit = await checkLimit(signupIpLimiter, ip)
  if (ipLimit.limited) {
    return NextResponse.json({ error: 'Too many signups. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfter) } })
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  if (!(await verifyTurnstile(typeof body.turnstileToken === 'string' ? body.turnstileToken : null, ip))) {
    return NextResponse.json({ error: 'Security check failed. Please try again.', field: 'form' }, { status: 400 })
  }

  const parsed = validateSignup(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.code, field: parsed.field }, { status: 400 })
  const input = parsed.value

  const domainLimit = await checkLimit(signupDomainLimiter, emailDomain(input.email))
  if (domainLimit.limited) {
    return NextResponse.json({ error: 'Too many signups. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(domainLimit.retryAfter) } })
  }

  const service = createServiceClient()
  const now = new Date().toISOString()
  const [{ data: takenOrg }, { data: takenPending }, { data: existingUser }] = await Promise.all([
    service.from('organizations').select('id').ilike('slug', input.slug).maybeSingle(),
    service.from('pending_signups').select('id').ilike('slug', input.slug).is('verified_at', null).gt('expires_at', now).limit(1).maybeSingle(),
    service.from('profiles').select('uid').ilike('email', input.email).limit(1).maybeSingle(),
  ])
  // "Slug taken" may be revealed (it's public on /join); account existence may not.
  if (takenOrg || takenPending) return NextResponse.json({ error: 'slug_taken', field: 'slug' }, { status: 409 })

  // Loaded here, not at module scope: @/lib/email reads required env vars,
  // which breaks page-data collection during `next build`.
  const { sendEmail } = await import('@/lib/email')
  try {
    if (existingUser) {
      await sendEmail({
        to: input.email,
        subject: input.locale === 'es' ? 'Ya tienes una cuenta' : 'You already have an account',
        react: SignupVerifyEmail({ variant: 'existing', churchName: input.churchName, actionUrl: `${baseUrl}/login`, locale: input.locale }),
      })
    } else {
      const { token, hash } = newSignupToken()
      const { error } = await service.from('pending_signups').insert({
        token_hash: hash,
        email: input.email,
        slug: input.slug,
        payload: input,
        expires_at: new Date(Date.now() + SIGNUP_TOKEN_TTL_MS).toISOString(),
      })
      if (error) return NextResponse.json({ error: 'Could not start signup. Please try again.' }, { status: 500 })
      try {
        await sendEmail({
          to: input.email,
          subject: input.locale === 'es' ? 'Confirma tu correo' : 'Confirm your email',
          react: SignupVerifyEmail({ variant: 'verify', churchName: input.churchName, actionUrl: `${baseUrl}/api/signup/verify?token=${token}`, locale: input.locale }),
        })
      } catch (err) {
        await service.from('pending_signups').delete().eq('token_hash', hash)
        throw err
      }
    }
  } catch {
    return NextResponse.json({ error: 'We could not send the confirmation email. Please try again later.' }, { status: 503 })
  }

  return NextResponse.json({ ok: true }, { status: 202 })
}
