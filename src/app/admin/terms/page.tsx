import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminTermsPage() {
  const t = await getTranslations('adminTerms')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('profiles').select('role').eq('auth_id', user.id).single()
  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const { data: terms } = await supabase
    .from('academic_terms')
    .select('id, term_name, term_code, type, start_date, end_date, depth, is_active, parent_term_id')
    .order('start_date', { ascending: false })

  const typeLabels: Record<string, string> = {
    academic_year: t('typeAcademicYear'),
    semester:      t('typeSemester'),
    trimester:     t('typeTrimester'),
    quarter:       t('typeQuarter'),
    block:         t('typeBlock'),
    ad_hoc:        t('typeAdHoc'),
    self_paced:    t('typeSelfPaced'),
    series:        t('typeSeries'),
  }

  // Build tree: top-level first, then children grouped under parents
  type Term = NonNullable<typeof terms>[number]
  const roots    = (terms ?? []).filter((t) => !t.parent_term_id)
  const childMap = (terms ?? []).reduce<Record<string, Term[]>>((acc, t) => {
    if (t.parent_term_id) {
      acc[t.parent_term_id] = [...(acc[t.parent_term_id] ?? []), t]
    }
    return acc
  }, {})

  function renderTerm(termItem: Term, depth = 0) {
    const children = childMap[termItem.id] ?? []
    return (
      <div key={termItem.id}>
        <div className={`flex items-center gap-3 px-6 py-3.5 hover:bg-slate-800/40 transition-colors border-b border-slate-800 ${depth > 0 ? 'pl-12' : ''}`}>
          {depth > 0 && <span className="text-slate-500 text-xs shrink-0">↳</span>}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white">{termItem.term_name}</p>
            <p className="text-xs text-slate-400 font-mono">{termItem.term_code}</p>
          </div>
          <span className="text-xs text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">
            {typeLabels[termItem.type] ?? termItem.type}
          </span>
          <span className="text-xs text-slate-400 hidden sm:block">
            {new Date(termItem.start_date).toLocaleDateString(undefined, { timeZone: 'UTC' })} – {new Date(termItem.end_date).toLocaleDateString(undefined, { timeZone: 'UTC' })}
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
            termItem.is_active
              ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            {termItem.is_active ? t('statusActive') : t('statusInactive')}
          </span>
          <Link href={`/admin/terms/${termItem.id}`} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 hover:underline shrink-0">
            {t('edit')}
          </Link>
        </div>
        {children.map((c) => renderTerm(c, depth + 1))}
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-white">{t('heading')}</h1>
            <p className="text-sm text-slate-400 mt-1">{t('subtitle')}</p>
          </div>
          <Link href="/admin/terms/new" className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-4 py-2 rounded-xl text-sm hover:bg-indigo-500 transition-colors">
            {t('newTerm')}
          </Link>
        </div>

        {roots.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
            <p className="text-slate-400">{t('emptyState')}</p>
            <Link href="/admin/terms/new" className="mt-3 inline-block text-sm text-indigo-400 hover:underline">{t('createFirst')}</Link>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            {roots.map((r) => renderTerm(r))}
          </div>
        )}
      </div>
    </main>
  )
}
