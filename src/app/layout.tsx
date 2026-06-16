import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
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
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
