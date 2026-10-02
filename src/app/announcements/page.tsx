import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { cn } from '@/lib/utils'
import MarkReadButton from '@/components/dashboard/MarkReadButton'
import { getTranslations } from 'next-intl/server'
import PublishDraftButton from './PublishDraftButton'

export const dynamic = 'force-dynamic'

const PRIORITY_STYLE = {
  urgent: { bar: 'bg-rose-500',  badge: 'bg-rose-950/80 text-rose-300 border-rose-800'   },
  high:   { bar: 'bg-amber-500', badge: 'bg-amber-950/80 text-amber-300 border-amber-800' },
  normal: { bar: 'bg-indigo-500',   badge: 'bg-indigo-950/80 text-indigo-300 border-indigo-800'       },
  low:    { bar: 'bg-slate-600', badge: 'bg-slate-800 text-slate-400 border-slate-700' },
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function AnnouncementsPage() {
  const t = await getTranslations()
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

  // Staff also see their own drafts and scheduled announcements
  const [{ data: drafts }, { data: scheduled }] = await Promise.all([
    isStaff
      ? supabase
          .from('announcements')
          .select('id, title, priority, scope, publish_at, is_published, created_at')
          .eq('created_by', profile.uid)
          .eq('is_published', false)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    isStaff
      ? supabase
          .from('announcements')
          .select('id, title, priority, scope, publish_at, created_at')
          .eq('is_published', true)
          .gt('publish_at', new Date().toISOString())
          .order('publish_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  const items = (announcements ?? []).map((a: any) => ({
    ...a,
    isRead:     (a.announcement_reads ?? []).length > 0,
    authorName: a.profiles?.display_name ?? 'Staff',
  }))

  return (
    <main className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight font-display">{t('announcements.heading')}</h1>
            {items.filter((a) => !a.isRead).length > 0 && (
              <p className="text-sm text-slate-400 mt-0.5">
                {t('common.unreadCountTemplate', { n: items.filter((a) => !a.isRead).length })}
              </p>
            )}
          </div>
          {isStaff && (
            <Link
              href="/announcements/new"
              className="inline-flex items-center px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 transition-colors"
            >
              {t('announcements.newButton')}
            </Link>
          )}
        </div>

        {/* Staff drafts */}
        {isStaff && (drafts ?? []).length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-2">
              {t('announcements.draftsHeading')}
            </h2>
            <div className="space-y-2">
              {(drafts ?? []).map((d: any) => (
                <div key={d.id} className="card-crisp border-dashed px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{d.title}</p>
                    <p className="text-xs text-slate-400">{t('announcements.draftMetaTemplate', { scope: d.scope })}</p>
                  </div>
                  <PublishDraftButton id={d.id} label={t('announcements.publishAction')} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Scheduled announcements (staff only) */}
        {isStaff && (scheduled ?? []).length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-2">
              {t('announcements.scheduledHeading')}
            </h2>
            <div className="space-y-2">
              {(scheduled ?? []).map((s: any) => (
                <div key={s.id} className="card-crisp border-amber-800/60 bg-amber-950/30 px-4 py-3 flex items-center gap-4">
                  <span className="text-lg shrink-0" aria-hidden="true">🕐</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{s.title}</p>
                    <p className="text-xs text-amber-300">
                      {t('announcements.publishesDateTemplate', { date: new Date(s.publish_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      }) })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Published announcements */}
        {items.length === 0 ? (
          <div className="card-crisp p-12 text-center">
            <p className="text-slate-400 italic">{t('announcements.emptyState')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((a) => {
              const pStyle = PRIORITY_STYLE[a.priority as keyof typeof PRIORITY_STYLE] ?? PRIORITY_STYLE.normal
              return (
                <div
                  key={a.id}
                  className={cn(
                    'card-crisp overflow-hidden transition-opacity p-0',
                    a.isRead && 'opacity-60'
                  )}
                >
                  {/* Priority bar */}
                  <div className={cn('h-1', pStyle.bar)} />
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-white text-base leading-snug">{a.title}</h3>
                        <span className={cn('px-2 py-0.5 text-[10px] font-bold rounded-full border', pStyle.badge)}>
                          {t(`announcements.priority.${a.priority as 'urgent' | 'high' | 'normal' | 'low'}` as any)}
                        </span>
                        {!a.isRead && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                        )}
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">{timeLabel(a.publish_at)}</span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{a.body}</p>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
                      <span className="text-xs text-slate-400">{t('announcements.postedByTemplate', { authorName: a.authorName })}</span>
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
