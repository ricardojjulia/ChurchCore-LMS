import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { cn } from '@/lib/utils'
import MarkReadButton from './MarkReadButton'

const PRIORITY_STYLE = {
  urgent: 'bg-rose-950/40 border-rose-800/80 text-rose-300',
  high:   'bg-amber-950/40 border-amber-800/80 text-amber-300',
  normal: 'bg-indigo-950/40 border-indigo-800/80 text-indigo-300',
  low:    'card-crisp text-slate-300',
}

const PRIORITY_DOT = {
  urgent: 'bg-rose-500',
  high:   'bg-amber-400',
  normal: 'bg-indigo-400',
  low:    'bg-slate-500',
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600)   return `${Math.floor(s / 60)}m ago`
  if (s < 86400)  return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default async function DashboardAnnouncementsPreview({
  uid: _uid,
  isStaff,
}: {
  uid:     string
  isStaff: boolean
}) {
  const supabase = await createClient()

  const { data: announcements } = await supabase
    .from('announcements')
    .select(`
      id, title, body, priority, scope, publish_at, created_by,
      profiles!created_by ( display_name ),
      announcement_reads ( id )
    `)
    .eq('is_published', true)
    .lte('publish_at', new Date().toISOString())
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('publish_at', { ascending: false })
    .limit(5)

  if (!announcements || announcements.length === 0) {
    if (!isStaff) return null
    return (
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display font-bold text-white">Announcements</h2>
          <Link href="/announcements/new" className="text-xs text-amber-300 font-semibold hover:text-amber-200 transition-colors">
            + Post
          </Link>
        </div>
        <div className="card-crisp p-6 text-center">
          <p className="text-sm text-slate-400 italic">No announcements yet.</p>
        </div>
      </section>
    )
  }

  const items = announcements.map((a: any) => {
    const isRead = (a.announcement_reads ?? []).length > 0
    return { ...a, isRead, authorName: a.profiles?.display_name ?? 'Staff' }
  })

  const unreadCount = items.filter((a) => !a.isRead).length

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-display font-bold text-white">Announcements</h2>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/announcements" className="text-xs text-slate-400 hover:text-white transition-colors">
            View all
          </Link>
          {isStaff && (
            <Link href="/announcements/new" className="text-xs text-amber-300 font-semibold hover:text-amber-200 transition-colors">
              + Post
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {items.map((a) => (
          <div
            key={a.id}
            className={cn(
              'rounded-xl border px-4 py-3 transition-all',
              !a.isRead ? PRIORITY_STYLE[a.priority as keyof typeof PRIORITY_STYLE] : 'card-crisp opacity-75'
            )}
          >
            <div className="flex items-start gap-3">
              <span className={cn(
                'mt-1.5 w-2 h-2 rounded-full shrink-0',
                !a.isRead ? PRIORITY_DOT[a.priority as keyof typeof PRIORITY_DOT] : 'bg-slate-700'
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn('text-sm font-semibold leading-snug', !a.isRead ? 'text-white' : 'text-slate-300')}>
                    {a.title}
                  </p>
                  <span className="text-xs text-slate-400 shrink-0">{timeAgo(a.publish_at)}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{a.body}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-slate-400">by {a.authorName}</span>
                  {!a.isRead && <MarkReadButton announcementId={a.id} />}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
