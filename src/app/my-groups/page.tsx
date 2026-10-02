import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { getTranslations } from 'next-intl/server'

export const dynamic = 'force-dynamic'

const PURPOSE_ICONS: Record<string, string> = {
  collaboration: '🤝',
  grading:       '📊',
  project:       '🚀',
  discussion:    '💬',
  lab:           '🔬',
  general:       '📌',
}

export default async function MyGroupsPage() {
  const t = await getTranslations()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: groups, error } = await supabase.rpc('get_my_groups')

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-white tracking-tight font-display">{t('myGroups.list.heading')}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('myGroups.list.subtitle')}
          </p>
        </div>

        {error && (
          <div className="card-crisp border-rose-800/70 bg-rose-950/40 p-4 text-rose-300 text-sm mb-6">
            Unable to load your groups. Please try again.
          </div>
        )}

        {(!groups || groups.length === 0) ? (
          <div className="card-crisp p-12 text-center">
            <p className="text-4xl mb-3">👥</p>
            <p className="font-semibold text-white">{t('myGroups.list.emptyState')}</p>
            <p className="text-sm text-slate-400 mt-1">
              {t('myGroups.list.emptyDescription')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g: { group_id: string; group_name: string; group_code: string | null; purpose: string; member_role: string; blueprint_title: string; section_code: string; member_count: number }) => (
              <Link
                key={g.group_id}
                href={`/my-groups/${g.group_id}`}
                className="block card-crisp p-6 hover:border-indigo-500/50 hover:shadow-lg transition-all"
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl shrink-0" aria-hidden="true">
                    {PURPOSE_ICONS[g.purpose ?? ''] ?? '👥'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white">{g.group_name}</p>
                      {g.member_role === 'leader' && (
                        <span className="text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/70 px-2 py-0.5 rounded">
                          {t('myGroups.list.leaderBadge')}
                        </span>
                      )}
                      {g.group_code && (
                        <span className="text-xs font-mono text-slate-400">{g.group_code}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {g.blueprint_title} · <span className="font-mono text-indigo-400">{g.section_code}</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {t('myGroups.list.memberCountTemplate', { n: g.member_count })}
                    </p>
                  </div>
                  <span className="text-slate-400 shrink-0">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
