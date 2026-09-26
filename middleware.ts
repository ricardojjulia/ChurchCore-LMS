import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a legible 503 rather than an opaque MIDDLEWARE_INVOCATION_FAILED crash.
    return new NextResponse(
      'Service unavailable: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured in Vercel environment variables.',
      { status: 503, headers: { 'content-type': 'text/plain' } },
    )
  }

  // Link prefetches (every visible nav link, on every page) each used to make
  // a network getUser() round trip here — about 28 per page view. A prefetch
  // that carries a session cookie skips it: the prefetched page verifies the
  // user itself when it renders, and the next real navigation refreshes the
  // session. Prefetches without a session still get the redirect below.
  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch'
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
  if (isPrefetch && hasSession) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as any)
          )
        },
      },
    }
  )

  // IMPORTANT: always call getUser() to refresh the session token.
  // Without this, auth.uid() is null in RLS for expired tokens.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Redirect unauthenticated users away from protected routes.
  // /join and /api routes are intentionally public: /join handles self-registration
  // for unauthenticated visitors; /api routes (including Stripe webhooks) authenticate
  // themselves via their own mechanisms and must not be redirected.
  if (
    !user &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/auth') &&
    // The auth code exchange runs before a session exists by definition.
    pathname !== '/callback' &&
    !pathname.startsWith('/join') &&
    // Certificate verification links are shared with third parties
    // (COUNCIL-2026-028) and must open without an account.
    !pathname.startsWith('/verify/') &&
    !pathname.startsWith('/api/')
  ) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect authenticated users away from login
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico
     * - public assets (images, fonts, etc.)
     * - API routes handled by their own auth
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)',
  ],
}
