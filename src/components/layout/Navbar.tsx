import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import NavLinks from './NavLinks'
import NotificationBell from './NotificationBell'
import GlobalSearch from './GlobalSearch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import SignOutButton from './SignOutButton'

export default async function Navbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('uid, display_name, role')
    .eq('auth_id', user.id)
    .single()

  if (profileError) {
    console.error('[Navbar] profile query failed:', profileError.message, '| auth_id:', user.id)
  }

  const initial    = profile?.display_name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? '?'
  const isStaff    = profile?.role === 'teacher' || profile?.role === 'admin' || profile?.role === 'manager'
  const isAdmin    = profile?.role === 'admin' || profile?.role === 'manager'
  const isGuardian = profile?.role === 'guardian'
  const uid        = profile?.uid ?? null

  // Notification data is fetched client-side by NotificationBell via useNotifications hook.
  // Server fetches only what can't be deferred: unread message count + health error badge.
  const [{ data: msgCountRow }, { count: healthErrors }] = await Promise.all([
    uid
      ? supabase.rpc('count_unread_message_threads')
      : Promise.resolve({ data: 0 }),
    isAdmin
      ? supabase
          .from('system_health_checks')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'error')
      : Promise.resolve({ count: 0, data: null }),
  ])

  const unreadMessages   = typeof msgCountRow === 'number' ? msgCountRow : 0
  const healthErrorCount = healthErrors ?? 0

  return (
    <nav className="sticky top-0 z-40 w-full bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0 overflow-hidden">
          <Link
            href="/dashboard"
            className="text-white font-extrabold text-sm tracking-tight shrink-0 hover:text-indigo-300 transition-colors"
          >
            ChurchCore LMS
          </Link>
          <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <NavLinks isStaff={isStaff} isAdmin={isAdmin} isGuardian={isGuardian} messageCount={unreadMessages} healthErrorCount={healthErrorCount} />
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <GlobalSearch />

          {uid && (
            <NotificationBell userId={uid} />
          )}

          <Link href="/profile" title={profile?.display_name ?? user.email ?? 'Profile'}>
            <Avatar className="h-8 w-8 hover:opacity-80 transition-opacity">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                {initial}
              </AvatarFallback>
            </Avatar>
          </Link>
          <SignOutButton />
        </div>
      </div>
    </nav>
  )
}
