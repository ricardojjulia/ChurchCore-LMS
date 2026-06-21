import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import NewMessageButton from './NewMessageButton'

export const dynamic = 'force-dynamic'

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid')
    .eq('auth_id', user.id)
    .single()
  if (!profile) redirect('/login')

  // Get all threads with participant info + co-participant names
  const { data: participations } = await supabase
    .from('message_thread_participants')
    .select(`
      thread_id,
      last_read_at,
      is_muted,
      message_threads (
        id,
        thread_type,
        subject,
        last_message_at,
        last_message_preview,
        last_sender_uid,
        created_at,
        message_thread_participants (
          user_id,
          profiles (
            uid,
            display_name,
            email
          )
        )
      )
    `)
    .eq('user_id', profile.uid)
    .is('left_at', null)
    .order('message_threads(last_message_at)', { ascending: false, nullsFirst: false })

  // Supabase doesn't narrow nested join shapes — define the type from the select above
  type ThreadRow = {
    id: string; thread_type: string; subject: string | null
    last_message_at: string | null; last_message_preview: string | null
    last_sender_uid: string | null; created_at: string
    message_thread_participants: { user_id: string; profiles: { uid: string; display_name: string; email: string } | null }[]
  }

  const threads = (participations ?? [])
    .map((p) => {
      const thread = p.message_threads as unknown as ThreadRow | null
      if (!thread) return null

      // Co-participants (not me)
      const others = (thread.message_thread_participants ?? [])
        .filter((tp: any) => tp.user_id !== profile.uid)
        .map((tp: any) => tp.profiles)
        .filter(Boolean)

      const displayName = others.length > 0
        ? others.map((o: any) => o.display_name).join(', ')
        : thread.subject ?? 'Conversation'

      const isUnread =
        !p.is_muted &&
        thread.last_message_at &&
        thread.last_sender_uid !== profile.uid &&
        (!p.last_read_at || p.last_read_at < thread.last_message_at)

      return {
        threadId:       thread.id,
        displayName,
        preview:        thread.last_message_preview ?? null,
        lastMessageAt:  thread.last_message_at ?? thread.created_at,
        isUnread,
        initial:        (others[0]?.display_name?.[0] ?? '?').toUpperCase(),
      }
    })
    .filter(Boolean) as {
      threadId: string
      displayName: string
      preview: string | null
      lastMessageAt: string
      isUnread: boolean
      initial: string
    }[]

  const unreadCount = threads.filter((t) => t.isUnread).length

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Messages</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {unreadCount} unread conversation{unreadCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <NewMessageButton />
        </div>

        {threads.length === 0 ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <p className="text-muted-foreground italic mb-4">No conversations yet.</p>
            <NewMessageButton />
          </div>
        ) : (
          <div className="bg-white border border-border rounded-2xl overflow-hidden divide-y divide-border">
            {threads.map((t) => (
              <Link
                key={t.threadId}
                href={`/messages/${t.threadId}`}
                className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group"
              >
                {/* Avatar */}
                <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">
                  {t.initial}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${t.isUnread ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
                      {t.displayName}
                    </p>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {timeAgo(t.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {t.isUnread && (
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    )}
                    <p className={`text-xs truncate ${t.isUnread ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {t.preview ?? 'No messages yet'}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
