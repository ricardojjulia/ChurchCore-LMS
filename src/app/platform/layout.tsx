import { redirect }          from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import Link                   from 'next/link'
import { PlatformNav }        from './PlatformNav'

export const metadata = { title: 'Platform Admin — ChurchCore' }

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  // Silent redirect — do not reveal the /platform route exists to non-admins
  if (!isAdmin) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
          <span className="text-sm font-bold tracking-widest text-indigo-400 uppercase">Platform Admin</span>
          <PlatformNav />
          <div className="ml-auto">
            <Link href="/dashboard" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              ← Back to app
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        {children}
      </main>
    </div>
  )
}
