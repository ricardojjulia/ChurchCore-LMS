import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

const FORMAT_LABELS: Record<string, string> = {
  synchronous:  'Sync',
  asynchronous: 'Async',
  hybrid:       'Hybrid',
  self_paced:   'Self-paced',
}

const FORMAT_COLORS: Record<string, string> = {
  synchronous:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  asynchronous: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  hybrid:       'bg-amber-50 text-amber-700 border-amber-200',
  self_paced:   'bg-slate-100 text-slate-600 border-slate-200',
}

export default async function AdminSectionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

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

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Sections</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Scheduled instances of course blueprints — manage groups and enrollment here.
            </p>
          </div>
          <Link href="/admin/sections/new" className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2 rounded-xl text-sm hover:bg-primary/90 transition-colors">
            + New Section
          </Link>
        </div>

        {(!sections || sections.length === 0) ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <p className="text-muted-foreground">No sections yet.</p>
            <p className="text-xs text-muted-foreground mt-2">
              Create sections via the academic term and blueprint admin pages.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-muted-foreground">Blueprint</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Term</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Section</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Format</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Groups</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
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
                          {FORMAT_LABELS[s.delivery_format] ?? s.delivery_format}
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
                          {s.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/admin/sections/${s.id}`}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          Groups →
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
