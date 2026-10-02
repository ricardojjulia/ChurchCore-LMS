import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminCohortsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const { data: cohorts } = await supabase
    .from('global_cohorts')
    .select(`
      id, cohort_name, cohort_code, description, is_active, created_at,
      program_tracks ( name, code )
    `)
    .order('created_at', { ascending: false })

  const { data: memberCounts } = await supabase
    .from('cohort_members')
    .select('cohort_id')
    .eq('status', 'active')

  const countMap = (memberCounts ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.cohort_id] = (acc[r.cohort_id] ?? 0) + 1
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Cohorts</h1>
            <p className="text-sm text-slate-400 mt-1">
              Cross-course student groupings — enroll entire cohorts into sections at once.
            </p>
          </div>
          <Link
            href="/admin/cohorts/new"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            + New Cohort
          </Link>
        </div>

        {(!cohorts || cohorts.length === 0) ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
            <p className="text-slate-400">No cohorts yet.</p>
            <Link href="/admin/cohorts/new" className="mt-3 inline-block text-sm text-indigo-400 hover:underline">
              Create the first cohort →
            </Link>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 border-b border-slate-800">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-slate-300">Cohort</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-300">Track</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-300">Members</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-300">Status</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {cohorts.map((c) => {
                  const track = c.program_tracks as unknown as { name: string; code: string } | null
                  const memberCount = countMap[c.id] ?? 0
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-white">{c.cohort_name}</p>
                        <p className="text-xs text-slate-400 font-mono">{c.cohort_code}</p>
                        {c.description && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{c.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-300">
                        {track ? (
                          <span className="inline-flex items-center gap-1 bg-indigo-950/50 text-indigo-400 text-xs font-semibold px-2 py-0.5 rounded border border-indigo-800">
                            {track.code}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-bold text-white">{memberCount}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          c.is_active
                            ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {c.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/admin/cohorts/${c.id}`}
                          className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 hover:underline"
                        >
                          Manage →
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
