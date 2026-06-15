import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

const TYPE_LABELS: Record<string, string> = {
  academic_year: 'Academic Year',
  semester:      'Semester',
  trimester:     'Trimester',
  quarter:       'Quarter',
  block:         'Block',
  ad_hoc:        'Ad Hoc',
  self_paced:    'Self-paced',
  series:        'Series',
}

export default async function AdminTermsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: me } = await supabase.from('profiles').select('role').eq('auth_id', user.id).single()
  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const { data: terms } = await supabase
    .from('academic_terms')
    .select('id, term_name, term_code, type, start_date, end_date, depth, is_active, parent_term_id')
    .order('start_date', { ascending: false })

  // Build tree: top-level first, then children grouped under parents
  type Term = NonNullable<typeof terms>[number]
  const roots    = (terms ?? []).filter((t) => !t.parent_term_id)
  const childMap = (terms ?? []).reduce<Record<string, Term[]>>((acc, t) => {
    if (t.parent_term_id) {
      acc[t.parent_term_id] = [...(acc[t.parent_term_id] ?? []), t]
    }
    return acc
  }, {})

  function renderTerm(t: Term, depth = 0) {
    const children = childMap[t.id] ?? []
    return (
      <div key={t.id}>
        <div className={`flex items-center gap-3 px-6 py-3.5 hover:bg-slate-50 transition-colors border-b border-border ${depth > 0 ? 'pl-12' : ''}`}>
          {depth > 0 && <span className="text-muted-foreground text-xs shrink-0">↳</span>}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">{t.term_name}</p>
            <p className="text-xs text-muted-foreground font-mono">{t.term_code}</p>
          </div>
          <span className="text-xs text-muted-foreground bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
            {TYPE_LABELS[t.type] ?? t.type}
          </span>
          <span className="text-xs text-muted-foreground hidden sm:block">
            {new Date(t.start_date).toLocaleDateString()} – {new Date(t.end_date).toLocaleDateString()}
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
            t.is_active
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}>
            {t.is_active ? 'Active' : 'Inactive'}
          </span>
          <Link href={`/admin/terms/${t.id}`} className="text-sm font-semibold text-primary hover:underline shrink-0">
            Edit
          </Link>
        </div>
        {children.map((c) => renderTerm(c, depth + 1))}
      </div>
    )
  }

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Academic Terms</h1>
            <p className="text-sm text-muted-foreground mt-1">Hierarchical terms — semesters nest inside academic years.</p>
          </div>
          <Link href="/admin/terms/new" className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2 rounded-xl text-sm hover:bg-primary/90 transition-colors">
            + New Term
          </Link>
        </div>

        {roots.length === 0 ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <p className="text-muted-foreground">No terms yet.</p>
            <Link href="/admin/terms/new" className="mt-3 inline-block text-sm text-primary hover:underline">Create the first term →</Link>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
            {roots.map((t) => renderTerm(t))}
          </div>
        )}
      </div>
    </main>
  )
}
