import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createServiceClient }  from '@/utils/supabase/service'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token  = searchParams.get('t')
  const orgId  = searchParams.get('org')
  const origin = new URL(request.url).origin

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/platform?error=${encodeURIComponent(reason)}`, origin))

  if (!token || !orgId) return fail('missing_params')

  const service = createServiceClient()

  // Fetch org settings and validate the one-time token
  const { data: org } = await service
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single()

  if (!org) return fail('org_not_found')

  const demo = org.settings?.demo as {
    password?: string
    pending_login?: { token: string; email: string; org_id: string; expires_at: string }
  } | undefined

  const pending = demo?.pending_login
  if (!pending || pending.token !== token || pending.org_id !== orgId) {
    return fail('invalid_token')
  }
  if (new Date(pending.expires_at) < new Date()) {
    return fail('token_expired')
  }
  if (!demo?.password) return fail('no_demo_password')

  // Invalidate the token immediately so it cannot be reused
  const updatedSettings = {
    ...org.settings,
    demo: { ...demo, pending_login: null },
  }
  await service.from('organizations').update({ settings: updatedSettings }).eq('id', orgId)

  // Sign in as the demo user. Cookies are set directly on the redirect response
  // so the browser receives the new session without a separate exchange step.
  const redirectResponse = NextResponse.redirect(new URL('/dashboard', origin))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Next.js / Supabase cookie option types diverge slightly
            redirectResponse.cookies.set(name, value, options as any),
          )
        },
      },
    },
  )

  const { error } = await supabase.auth.signInWithPassword({
    email:    pending.email,
    password: demo.password,
  })

  if (error) return fail('sign_in_failed')

  return redirectResponse
}
