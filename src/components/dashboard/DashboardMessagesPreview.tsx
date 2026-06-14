import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default async function DashboardMessagesPreview({ uid }: { uid: string }) {
  const supabase = await createClient()

  const { data: participations } = await supabase
    .from('message_thread_participants')
    .select(`
      thread_id,
      last_read_at,
      message_threads (
        id,
        last_message_at,
        last_message_preview,
        last_sender_uid,
        message_thread_participants (
          user_id,
          profiles ( uid, display_name )
        )
      )
    `)
    .eq('user_id', uid)
    .is('left_at', null)
    .not('message_threads.last_message_at', 'is', null)
    .order('message_threads(last_message_at)', { ascending: false, nullsFirst: false })
    .limit(3)

  const threads = (participations ?? [])
    .map((p) => {
      const t = p.message_threads as any
      if (!t) return null

      const others = (t.message_thread_participants ?? [])
        .filter((tp: any) => tp.user_id !== uid)
        .map((tp: any) => tp.profiles)
        .filter(Boolean)

      const isUnread =
        t.last_message_at &&
        t.last_sender_uid !== uid &&
        (!p.last_read_at || p.last_read_at < t.last_message_at)

      return {
        threadId:      t.id,
        displayName:   others[0]?.display_name ?? 'Unknown',
        initial:       (others[0]?.display_name?.[0] ?? '?').toUpperCase(),
        preview:       t.last_message_preview ?? '',
        lastAt:        t.last_message_at,
        isUnread,
      }
    })
    .filter(Boolean) as {
      threadId: string; displayName: string; initial: string
      preview: string; lastAt: string; isUnread: boolean
    }[]

  if (threads.length === 0) return null

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground">Messages</h2>
        <Link href="/messages" className="text-xs text-primary font-medium hover:underline">
          View all →
        </Link>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden divide-y divide-border">
        {threads.map((t) => (
          <Link
            key={t.threadId}
            href={`/messages/${t.threadId}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">
              {t.initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className={`text-sm truncate ${t.isUnread ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
                  {t.displayName}
                </p>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">{timeAgo(t.lastAt)}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {t.isUnread && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                <p className={`text-xs truncate ${t.isUnread ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {t.preview}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
