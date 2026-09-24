import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createServiceClient }  from '@/utils/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

export const runtime = 'nodejs'

function sameToken(expected: string, given: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token  = searchParams.get('t')
  const orgId  = searchParams.get('org')
  // Relative Location headers: the browser resolves them against the host it
  // actually used, so the session cookie set below always matches (request.url
  // can name a different host than the browser's behind a proxy or bind).
  const redirectTo = (path: string) => new NextResponse(null, { status: 307, headers: { Location: path } })
  const fail = (reason: string) => redirectTo(`/platform?error=${encodeURIComponent(reason)}`)

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
    pending_login?: { token: string; email: string; org_id: string; expires_at: string } | null
  } | undefined

  const pending = demo?.pending_login
  if (!pending || !sameToken(pending.token, token) || pending.org_id !== orgId) {
    return fail('invalid_token')
  }
  if (new Date(pending.expires_at) < new Date()) {
    return fail('token_expired')
  }

  // Invalidate the token immediately so it cannot be reused
  const updatedSettings = {
    ...org.settings,
    demo: { ...demo, pending_login: null },
  }
  await service.from('organizations').update({ settings: updatedSettings }).eq('id', orgId)

  // Sign in as the demo user. Cookies are set directly on the redirect response
  // so the browser receives the new session without a separate exchange step.
  const redirectResponse = redirectTo('/dashboard')

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

  // Demo users have random, unknown passwords. Mint a one-time magic link on
  // the server and redeem it immediately; nothing is emailed.
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type:  'magiclink',
    email: pending.email,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) return fail('sign_in_failed')

  const { error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash })
  if (error) return fail('sign_in_failed')

  return redirectResponse
}
