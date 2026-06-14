import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import MessageThread from './MessageThread'

export const dynamic = 'force-dynamic'

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, display_name')
    .eq('auth_id', user.id)
    .single()
  if (!profile) redirect('/login')

  // Validate participation — RLS will return null if not a participant
  const { data: participant } = await supabase
    .from('message_thread_participants')
    .select('thread_id, can_reply, message_threads(id, thread_type, subject)')
    .eq('thread_id', threadId)
    .eq('user_id', profile.uid)
    .is('left_at', null)
    .single()

  if (!participant) notFound()

  const thread = participant.message_threads as any

  // Get co-participants for display name
  const { data: allParticipants } = await supabase
    .from('message_thread_participants')
    .select('user_id, profiles(uid, display_name, email)')
    .eq('thread_id', threadId)
    .is('left_at', null)

  const others = (allParticipants ?? [])
    .filter((p: any) => p.user_id !== profile.uid)
    .map((p: any) => p.profiles)
    .filter(Boolean)

  const threadTitle = thread?.subject || (others.length > 0
    ? others.map((o: any) => o.display_name).join(', ')
    : 'Conversation')

  // Prefetch last 50 messages (newest last for display)
  const { data: messages } = await supabase
    .from('messages')
    .select(`
      id,
      thread_id,
      sender_id,
      body,
      is_deleted,
      created_at,
      profiles (
        uid,
        display_name
      )
    `)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(50)

  const sortedMessages = (messages ?? []).reverse()

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* Thread header */}
      <div className="bg-white border-b border-border px-4 py-3 flex items-center gap-3 sticky top-14 z-30">
        <Link href="/messages" className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>

        {/* Others' avatars */}
        <div className="flex -space-x-2">
          {others.slice(0, 3).map((o: any) => (
            <div key={o.uid} className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center border-2 border-white">
              {o.display_name?.[0]?.toUpperCase()}
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground text-sm truncate">{threadTitle}</p>
          {others.length === 1 && (
            <p className="text-xs text-muted-foreground truncate">{others[0]?.email}</p>
          )}
        </div>
      </div>

      {/* Realtime message thread */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-0 sm:px-4 py-0">
        <MessageThread
          threadId={threadId}
          myUid={profile.uid}
          initialMessages={sortedMessages as any}
        />
      </div>
    </main>
  )
}
