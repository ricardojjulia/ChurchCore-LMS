import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import SidebarMain from '@/components/layout/SidebarMain'
import { SidebarProvider } from '@/components/layout/SidebarContext'
import MobileBottomNavServer from '@/components/layout/MobileBottomNavServer'
import MobileAdminDrawerServer from '@/components/layout/MobileAdminDrawerServer'
import { Toaster } from '@/components/ui/toaster'

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

async function getBrandingColor(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase
      .from('profiles').select('org_id').eq('auth_id', user.id).single()
    if (!profile?.org_id) return null
    const { data: org } = await supabase
      .from('organizations').select('settings').eq('id', profile.org_id).single()
    return org?.settings?.branding?.primary_color ?? null
  } catch {
    return null
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const primaryColor = await getBrandingColor()
  const brandCss     = primaryColor ? `:root{--color-primary:${primaryColor};}` : null

  return (
    <html lang="en">
      <head>
        {brandCss && <style>{brandCss}</style>}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#4f46e5" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ChurchCore LMS" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className={inter.className}>
        {/* WCAG 2.1 AA — skip navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-white focus:text-foreground focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:font-semibold focus:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          Skip to main content
        </a>

        <SidebarProvider>
          <Sidebar />
          <SidebarMain>
            {children}
          </SidebarMain>
        </SidebarProvider>

        <MobileBottomNavServer />
        <MobileAdminDrawerServer />
        <Toaster />
      </body>
    </html>
  )
}
