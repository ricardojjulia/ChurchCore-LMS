import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { cn } from '@/lib/utils'
import MarkReadButton from '@/components/dashboard/MarkReadButton'

export const dynamic = 'force-dynamic'

const PRIORITY_STYLE = {
  urgent: { bar: 'bg-rose-500',  badge: 'bg-rose-100 text-rose-700 border-rose-200',   label: 'Urgent' },
  high:   { bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700 border-amber-200', label: 'High'   },
  normal: { bar: 'bg-sky-500',   badge: 'bg-sky-100 text-sky-700 border-sky-200',       label: 'Normal' },
  low:    { bar: 'bg-slate-300', badge: 'bg-slate-100 text-slate-600 border-slate-200', label: 'Low'    },
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function AnnouncementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()
  if (!profile) redirect('/login')

  const isStaff = ['admin', 'teacher', 'manager'].includes(profile.role)

  // Published announcements for current user (RLS filters by scope)
  const { data: announcements } = await supabase
    .from('announcements')
    .select(`
      id, title, body, priority, scope, publish_at, created_at,
      profiles!created_by ( display_name ),
      announcement_reads ( id )
    `)
    .eq('is_published', true)
    .lte('publish_at', new Date().toISOString())
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('publish_at', { ascending: false })
    .limit(50)

  // Staff also see their own drafts
  const { data: drafts } = isStaff
    ? await supabase
        .from('announcements')
        .select('id, title, priority, scope, publish_at, is_published, created_at')
        .eq('created_by', profile.uid)
        .eq('is_published', false)
        .order('created_at', { ascending: false })
    : { data: [] }

  const items = (announcements ?? []).map((a: any) => ({
    ...a,
    isRead:     (a.announcement_reads ?? []).length > 0,
    authorName: a.profiles?.display_name ?? 'Staff',
  }))

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Announcements</h1>
            {items.filter((a) => !a.isRead).length > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {items.filter((a) => !a.isRead).length} unread
              </p>
            )}
          </div>
          {isStaff && (
            <Link
              href="/announcements/new"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              + Post Announcement
            </Link>
          )}
        </div>

        {/* Staff drafts */}
        {isStaff && (drafts ?? []).length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-2">
              Your Drafts
            </h2>
            <div className="space-y-2">
              {(drafts ?? []).map((d: any) => (
                <div key={d.id} className="bg-white border border-dashed border-border rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground">Draft · {d.scope}</p>
                  </div>
                  <Link
                    href={`/announcements/new?edit=${d.id}`}
                    className="text-xs text-primary font-medium shrink-0 hover:underline"
                  >
                    Publish
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Published announcements */}
        {items.length === 0 ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <p className="text-muted-foreground italic">No announcements yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((a) => {
              const pStyle = PRIORITY_STYLE[a.priority as keyof typeof PRIORITY_STYLE] ?? PRIORITY_STYLE.normal
              return (
                <div
                  key={a.id}
                  className={cn(
                    'bg-white border border-border rounded-2xl overflow-hidden transition-opacity',
                    a.isRead && 'opacity-60'
                  )}
                >
                  {/* Priority bar */}
                  <div className={cn('h-1', pStyle.bar)} />
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-foreground text-base leading-snug">{a.title}</h3>
                        <span className={cn('px-2 py-0.5 text-[10px] font-bold rounded-full border', pStyle.badge)}>
                          {pStyle.label}
                        </span>
                        {!a.isRead && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{timeLabel(a.publish_at)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{a.body}</p>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">Posted by {a.authorName}</span>
                      {!a.isRead && <MarkReadButton announcementId={a.id} />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
