import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import NotificationsClient from './NotificationsClient'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid')
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, type, title, body, link, is_read, is_dismissed, created_at')
    .eq('user_id', profile.uid)
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false })
    .limit(100)

  const unreadCount = (notifications ?? []).filter((n) => !n.is_read).length

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {unreadCount} unread
              </p>
            )}
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Dashboard
          </Link>
        </div>

        <NotificationsClient
          initialItems={notifications ?? []}
          userId={profile.uid}
        />
      </div>
    </main>
  )
}
