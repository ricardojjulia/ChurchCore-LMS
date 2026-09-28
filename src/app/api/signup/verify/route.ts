import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createServiceClient } from '@/utils/supabase/service'
import { provisionTenant } from '@/lib/tenancy/provision'
import { hashSignupToken, signupEnabled, type SignupInput } from '@/lib/signup'

export const runtime = 'nodejs'

// Email verification for self-serve signup (COUNCIL-2026-034). Only now is
// the tenant provisioned and the admin account created (Amendment 3). The
// admin is signed in with a server-minted magic link; no password exists yet.
// Redirects are relative so the session cookie matches the host the browser used.
const redirectTo = (path: string) => new NextResponse(null, { status: 307, headers: { Location: path } })

export async function GET(req: NextRequest) {
  if (!signupEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return redirectTo('/start?error=invalid_link')

  const service = createServiceClient()
  // Claim the token atomically: only one request can move it to verified.
  const { data: pending } = await service
    .from('pending_signups')
    .update({ verified_at: new Date().toISOString() })
    .eq('token_hash', hashSignupToken(token))
    .is('verified_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id, email, payload')
    .maybeSingle()
  if (!pending) return redirectTo('/start?error=invalid_link')

  const input = pending.payload as SignupInput
  const { org, error } = await provisionTenant(service, {
    name: input.churchName, slug: input.slug, source: 'self_serve', timezone: input.timezone, locale: input.locale,
  })
  if (!org) {
    await service.from('pending_signups').delete().eq('id', pending.id)
    return redirectTo(`/start?error=${error === 'slug_taken' ? 'slug_taken' : 'failed'}`)
  }

  // Role and org only in app_metadata (COUNCIL-2026-032); handle_new_user reads it.
  const { data: created, error: userError } = await service.auth.admin.createUser({
    email: pending.email,
    email_confirm: true,
    user_metadata: { display_name: input.adminName },
    app_metadata: { org_id: org.id, role: 'admin' },
  })
  if (userError || !created.user) {
    // Roll back fully, including the token claim, so the same link can be
    // retried instead of being dead (PR #36 review).
    await service.from('organizations').delete().eq('id', org.id)
    await service.from('pending_signups').update({ verified_at: null }).eq('id', pending.id)
    return redirectTo('/start?error=failed')
  }
  await service.from('profiles').update({ display_name: input.adminName }).eq('auth_id', created.user.id)
  await service.from('pending_signups').delete().eq('id', pending.id)

  // Straight to choosing a password: this one-time-link session is the only
  // way in until they have one (COUNCIL-2026-045).
  const response = redirectTo('/account/password?welcome=1')
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies: { name: string; value: string; options?: CookieOptions }[]) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Next.js / Supabase cookie option types diverge slightly
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options as any)),
      },
    },
  )
  const { data: link } = await service.auth.admin.generateLink({ type: 'magiclink', email: pending.email })
  const tokenHash = link?.properties?.hashed_token
  if (!tokenHash || (await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash })).error) {
    // The church exists; the admin can sign in with a magic link or password reset.
    return redirectTo('/login?created=1')
  }
  return response
}
