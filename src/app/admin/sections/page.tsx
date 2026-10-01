import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

const FORMAT_COLORS: Record<string, string> = {
  synchronous:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  asynchronous: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  hybrid:       'bg-amber-50 text-amber-700 border-amber-200',
  self_paced:   'bg-slate-100 text-slate-600 border-slate-200',
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
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">{t('heading')}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('subtitle')}
            </p>
          </div>
          <Link href="/admin/sections/new" className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2 rounded-xl text-sm hover:bg-primary/90 transition-colors">
            {t('newSection')}
          </Link>
        </div>

        {(!sections || sections.length === 0) ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <p className="text-muted-foreground">{t('emptyState')}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {t('createFirst')}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-muted-foreground">{t('tableBlueprint')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('tableTerm')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('tableSection')}</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{t('tableFormat')}</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{t('tableGroups')}</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{t('tableStatus')}</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sections.map((s) => {
                  const blueprint = s.course_blueprints as unknown as { title: string; course_code: string } | null
                  const term      = s.academic_terms    as unknown as { term_name: string; term_code: string } | null
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-foreground">{blueprint?.title ?? '—'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{blueprint?.course_code}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-foreground">{term?.term_name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{term?.term_code}</p>
                      </td>
                      <td className="px-4 py-4 font-mono text-sm text-foreground">{s.section_code}</td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded border ${FORMAT_COLORS[s.delivery_format] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {formatLabels[s.delivery_format] ?? s.delivery_format}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-bold text-foreground">{groupCountMap[s.id] ?? 0}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          s.is_active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {s.is_active ? t('statusActive') : t('statusInactive')}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/admin/sections/${s.id}`}
                          className="text-sm font-semibold text-primary hover:underline"
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
