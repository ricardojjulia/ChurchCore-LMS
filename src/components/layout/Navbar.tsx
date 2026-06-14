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

  const initial  = profile?.display_name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? '?'
  const isStaff  = profile?.role === 'teacher' || profile?.role === 'admin' || profile?.role === 'manager'
  const isAdmin  = profile?.role === 'admin'
  const uid      = profile?.uid ?? null

  // Fetch notification count + last 10 + unread message thread count
  const [{ count: unreadCount }, { data: recentNotifs }, { data: msgCountRow }] = await Promise.all([
    uid
      ? supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('is_read', false)
          .eq('is_dismissed', false)
      : Promise.resolve({ count: 0, data: null }),
    uid
      ? supabase
          .from('notifications')
          .select('id, type, title, body, link, is_read, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
    uid
      ? supabase.rpc('count_unread_message_threads')
      : Promise.resolve({ data: 0 }),
  ])

  const unreadMessages = typeof msgCountRow === 'number' ? msgCountRow : 0

  return (
    <nav className="sticky top-0 z-40 w-full bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <Link
            href="/dashboard"
            className="text-white font-extrabold text-sm tracking-tight shrink-0 hover:text-indigo-300 transition-colors"
          >
            ChurchCore
          </Link>
          <NavLinks isStaff={isStaff} isAdmin={isAdmin} messageCount={unreadMessages} />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <GlobalSearch />

          {uid && (
            <NotificationBell
              initialCount={unreadCount ?? 0}
              initialNotifications={recentNotifs ?? []}
              userId={uid}
            />
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
