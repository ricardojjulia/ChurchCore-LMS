import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

const FORMAT_COLORS: Record<string, string> = {
  synchronous:  'bg-indigo-950/50 text-indigo-400 border-indigo-800',
  asynchronous: 'bg-emerald-950/50 text-emerald-400 border-emerald-800',
  hybrid:       'bg-amber-950/50 text-amber-400 border-amber-800',
  self_paced:   'bg-slate-800 text-slate-400 border-slate-700',
}

export default async function AdminSectionsPage() {
  const t = await getTranslations('adminSections')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!me || !['admin', 'manager', 'teacher'].includes(me.role)) redirect('/dashboard')

  const { data: sections } = await supabase
    .from('course_sections')
    .select(`
      id, section_code, delivery_format, is_active, created_at,
      max_enrollment, enrollment_open_date, enrollment_close_date,
      course_blueprints ( title, course_code ),
      academic_terms ( term_name, term_code )
    `)
    .order('created_at', { ascending: false })

  const { data: groupCounts } = await supabase
    .from('section_groups')
    .select('section_id')

  const groupCountMap = (groupCounts ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.section_id] = (acc[r.section_id] ?? 0) + 1
    return acc
  }, {})

  const formatLabels: Record<string, string> = {
    synchronous:  t('formatSync'),
    asynchronous: t('formatAsync'),
    hybrid:       t('formatHybrid'),
    self_paced:   t('formatSelfPaced'),
  }

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-white">{t('heading')}</h1>
            <p className="text-sm text-slate-400 mt-1">
              {t('subtitle')}
            </p>
          </div>
          <Link href="/admin/sections/new" className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-4 py-2 rounded-xl text-sm hover:bg-indigo-500 transition-colors">
            {t('newSection')}
          </Link>
        </div>

        {(!sections || sections.length === 0) ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
            <p className="text-slate-400">{t('emptyState')}</p>
            <p className="text-xs text-slate-500 mt-2">
              {t('createFirst')}
            </p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-300">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-slate-400">{t('tableBlueprint')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-400">{t('tableTerm')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-400">{t('tableSection')}</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-400">{t('tableFormat')}</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-400">{t('tableGroups')}</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-400">{t('tableStatus')}</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {sections.map((s) => {
                  const blueprint = s.course_blueprints as unknown as { title: string; course_code: string } | null
                  const term      = s.academic_terms    as unknown as { term_name: string; term_code: string } | null
                  return (
                    <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-white">{blueprint?.title ?? '—'}</p>
                        <p className="text-xs text-slate-400 font-mono">{blueprint?.course_code}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-slate-200">{term?.term_name ?? '—'}</p>
                        <p className="text-xs text-slate-400 font-mono">{term?.term_code}</p>
                      </td>
                      <td className="px-4 py-4 font-mono text-sm text-slate-200">{s.section_code}</td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded border ${FORMAT_COLORS[s.delivery_format] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                          {formatLabels[s.delivery_format] ?? s.delivery_format}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-bold text-white">{groupCountMap[s.id] ?? 0}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          s.is_active
                            ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {s.is_active ? t('statusActive') : t('statusInactive')}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/admin/sections/${s.id}`}
                          className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 hover:underline"
                        >
                          {t('viewGroups')}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
