import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import CohortMemberPanel from './CohortMemberPanel'
import EditCohortForm from './EditCohortForm'

export const dynamic = 'force-dynamic'

export default async function CohortDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: cohortId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const [cohortResult, membersResult, jobsResult, tracksResult] = await Promise.all([
    supabase
      .from('global_cohorts')
      .select(`id, cohort_name, cohort_code, description, is_active, program_track_id, created_at, program_tracks(name, code)`)
      .eq('id', cohortId)
      .single(),
    supabase
      .from('cohort_members')
      .select('id, user_id, status, joined_at, notes')
      .eq('cohort_id', cohortId)
      .order('joined_at', { ascending: false }),
    supabase
      .from('enrollment_jobs')
      .select(`id, status, dry_run, total_members, processed_count, skipped_count, failed_count, result_summary, created_at, course_sections(section_code, course_blueprints(title))`)
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('program_tracks').select('id, name').order('name'),
  ])

  const cohort = cohortResult.data
  if (!cohort) redirect('/admin/cohorts')

  // cohort_members.user_id is an auth user id. PostgREST cannot embed the
  // auth schema, so the old `auth_user:user_id(email)` embed made the whole
  // query fail and the member list was always empty. Resolve emails from
  // profiles (auth_id) instead, keeping the shape CohortMemberPanel expects.
  const memberRows = membersResult.data ?? []
  const { data: memberProfiles } = memberRows.length
    ? await supabase.from('profiles').select('auth_id, email').in('auth_id', memberRows.map((m) => m.user_id))
    : { data: [] as Array<{ auth_id: string; email: string | null }> }
  const emailByAuthId = new Map((memberProfiles ?? []).map((p) => [p.auth_id, p.email]))
  const members = memberRows.map((m) => ({
    ...m,
    auth_user: emailByAuthId.has(m.user_id) ? { email: emailByAuthId.get(m.user_id) ?? '' } : null,
  }))
  const jobs    = jobsResult.data ?? []

  const activeCount    = members.filter((m) => m.status === 'active').length
  const withdrawnCount = members.filter((m) => m.status === 'withdrawn').length

  const track = cohort.program_tracks as unknown as { name: string; code: string } | null

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-400">
          <Link href="/admin/cohorts" className="hover:text-amber-300 font-medium">Cohorts</Link>
          <span className="text-slate-600">/</span>
          <span className="text-white font-semibold">{cohort.cohort_name}</span>
        </nav>

        {/* Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold uppercase tracking-widest ${cohort.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {cohort.is_active ? 'Active' : 'Inactive'}
                </span>
                {track && (
                  <span className="text-xs font-semibold bg-indigo-950/50 text-indigo-400 border border-indigo-800 px-2 py-0.5 rounded">
                    {track.code}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-extrabold text-white">{cohort.cohort_name}</h1>
              <p className="text-sm font-mono text-slate-400 mt-0.5">{cohort.cohort_code}</p>
              {cohort.description && (
                <p className="text-sm text-slate-400 mt-2">{cohort.description}</p>
              )}
              <div className="flex gap-6 mt-4 text-sm text-slate-400">
                <span><strong className="text-white">{activeCount}</strong> active members</span>
                {withdrawnCount > 0 && (
                  <span><strong className="text-white">{withdrawnCount}</strong> withdrawn</span>
                )}
              </div>
            </div>
            <Link
              href={`/admin/cohorts/${cohortId}/enroll`}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors shrink-0"
            >
              Enroll in Section →
            </Link>
          </div>
        </div>

        <EditCohortForm
          cohortId={cohortId}
          initial={{
            cohort_name: cohort.cohort_name,
            description: cohort.description,
            program_track_id: cohort.program_track_id,
            is_active: cohort.is_active,
          }}
          tracks={tracksResult.data ?? []}
        />

        {/* Members panel — client component for add/remove */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase select return shape doesn't match component prop signature */}
        <CohortMemberPanel cohortId={cohortId} members={members as any} />

        {/* Recent enrollment jobs */}
        {jobs.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-4">Recent Enrollment Jobs</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/80 border-b border-slate-800">
                  <tr>
                    <th className="text-left px-6 py-3 font-semibold text-slate-300">Section</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-300">Type</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-300">Status</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-300">Enrolled</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-300">Skipped</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-300">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {jobs.map((job) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested join types not narrowed
                    const section = job.course_sections as any
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested join types not narrowed
                    const blueprint = section?.course_blueprints as any
                    const statusColors: Record<string, string> = {
                      completed: 'bg-emerald-950/50 text-emerald-400 border-emerald-800',
                      partial:   'bg-amber-950/50 text-amber-400 border-amber-800',
                      failed:    'bg-rose-950/50 text-rose-400 border-rose-800',
                      dry_run:   'bg-sky-950/50 text-sky-400 border-sky-800',
                      processing:'bg-indigo-950/50 text-indigo-400 border-indigo-800',
                      pending:   'bg-slate-800 text-slate-400 border-slate-700',
                    }
                    return (
                      <tr key={job.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-3">
                          <p className="font-medium text-white">{blueprint?.title ?? '—'}</p>
                          <p className="text-xs text-slate-400 font-mono">{section?.section_code ?? ''}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${job.dry_run ? 'bg-sky-950/50 text-sky-400 border-sky-800' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                            {job.dry_run ? 'Dry run' : 'Live'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusColors[job.status] ?? 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-emerald-400">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- result_summary is JSONB with dynamic shape */}
                          {(job.result_summary as any)?.enrolled ?? job.processed_count ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-400">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- result_summary is JSONB with dynamic shape */}
                          {(job.result_summary as any)?.skipped ?? job.skipped_count ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {new Date(job.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
