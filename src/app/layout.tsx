import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { createClient } from '@/utils/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { checkAuthPolicy, readAuthPolicy, signInMethods, type PolicyViolation } from '@/lib/auth-policy'
import Sidebar from '@/components/layout/Sidebar'
import SidebarMain from '@/components/layout/SidebarMain'
import { SidebarProvider } from '@/components/layout/SidebarContext'
import MobileBottomNavServer from '@/components/layout/MobileBottomNavServer'
import MobileAdminDrawerServer from '@/components/layout/MobileAdminDrawerServer'
import { Toaster } from '@/components/ui/toaster'
import { FeedbackSessionProvider } from '@/components/feedback/FeedbackSessionProvider'
import { FeedbackButton }          from '@/components/feedback/FeedbackButton'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getLocale } from 'next-intl/server'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ChurchCore LMS',
  description: 'A fast, secure, ministry-ready learning management system',
  icons: {
    icon: [
      { url: '/assets/brand/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/assets/brand/app-icon.png', sizes: '512x512', type: 'image/png' },
    ],
  },
}

// One lookup per page: the org's branding colour and its sign-in policy.
// A session that breaks the policy (COUNCIL-2026-037) is ended server-side
// before any page renders. Auth routes are exempt so the sign-out can happen.
// Branding is best-effort; enforcement is not: if an org has a sign-in rule
// and checking it fails, the error propagates to the error page rather than
// letting the session through.
async function getOrgContext(): Promise<{ primaryColor: string | null; violation: PolicyViolation | null }> {
  let supabase: Awaited<ReturnType<typeof createClient>>
  let user: { id: string; email?: string | null } | null = null
  let profile: { org_id: string | null; role: string | null } | null = null
  let settings: Record<string, unknown> | null = null
  try {
    supabase = await createClient()
    user = (await supabase.auth.getUser()).data.user
    if (!user) return { primaryColor: null, violation: null }
    profile = (await supabase.from('profiles').select('org_id, role').eq('auth_id', user.id).single()).data
    if (!profile?.org_id) return { primaryColor: null, violation: null }
    settings = (await supabase.from('organizations').select('settings').eq('id', profile.org_id).single()).data?.settings ?? null
  } catch {
    return { primaryColor: null, violation: null }
  }

  const policy = readAuthPolicy(settings)
  const hasRule = policy.require_sso_for_staff || policy.disable_password || policy.allowed_domains.length > 0
  const pathname = (await headers()).get('x-pathname') ?? ''
  const exempt = pathname.startsWith('/auth') || pathname === '/login' || pathname === '/callback'
  if (hasRule && !exempt) {
    const { data: claims, error } = await supabase.auth.getClaims()
    if (error) throw new Error('Sign-in policy check failed')
    const violation = checkAuthPolicy(policy, {
      role: profile.role ?? null, email: user.email ?? null, methods: signInMethods(claims?.claims?.amr),
    })
    if (violation) return { primaryColor: null, violation }
  }
  const branding = (settings as { branding?: { primary_color?: string } } | null)?.branding
  return { primaryColor: branding?.primary_color ?? null, violation: null }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const orgContext = await getOrgContext()
  if (orgContext.violation) redirect(`/auth/sign-out?reason=${orgContext.violation}`)
  const primaryColor = orgContext.primaryColor
  const brandCss     = primaryColor ? `:root{--color-primary:${primaryColor};}` : null
  const messages     = await getMessages()
  const locale       = await getLocale()

  return (
    <html lang={locale}>
      <head>
        {brandCss && <style>{brandCss}</style>}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#4f46e5" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ChurchCore LMS" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(regs) {
                  for (var r of regs) { r.unregister(); }
                });
              }
              if (typeof window !== 'undefined' && 'caches' in window) {
                caches.keys().then(function(keys) {
                  for (var k of keys) { caches.delete(k); }
                });
              }
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <NextIntlClientProvider messages={messages}>
        {/* WCAG 2.1 AA — skip navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-white focus:text-foreground focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:font-semibold focus:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          Skip to main content
        </a>

        <FeedbackSessionProvider>
          <SidebarProvider>
            <div className="no-print">
              <Sidebar />
            </div>
            <SidebarMain>
              {children}
            </SidebarMain>
          </SidebarProvider>

          <div className="no-print">
            <MobileBottomNavServer />
            <MobileAdminDrawerServer />
            <Toaster />
            <FeedbackButton />
          </div>
        </FeedbackSessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
