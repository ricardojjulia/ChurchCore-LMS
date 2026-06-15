import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import CohortMemberPanel from './CohortMemberPanel'

export const dynamic = 'force-dynamic'

export default async function CohortDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: cohortId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const [cohortResult, membersResult, jobsResult] = await Promise.all([
    supabase
      .from('global_cohorts')
      .select(`id, cohort_name, cohort_code, description, is_active, created_at, program_tracks(name, code)`)
      .eq('id', cohortId)
      .single(),
    supabase
      .from('cohort_members')
      .select(`id, user_id, status, joined_at, notes, auth_user:user_id(email)`)
      .eq('cohort_id', cohortId)
      .order('joined_at', { ascending: false }),
    supabase
      .from('enrollment_jobs')
      .select(`id, status, dry_run, total_members, processed_count, skipped_count, failed_count, result_summary, created_at, course_sections(section_code, course_blueprints(title))`)
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const cohort = cohortResult.data
  if (!cohort) redirect('/admin/cohorts')

  const members = membersResult.data ?? []
  const jobs    = jobsResult.data ?? []

  const activeCount    = members.filter((m) => m.status === 'active').length
  const withdrawnCount = members.filter((m) => m.status === 'withdrawn').length

  const track = cohort.program_tracks as unknown as { name: string; code: string } | null

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-400">
          <Link href="/admin/cohorts" className="hover:text-primary font-medium">Cohorts</Link>
          <span>/</span>
          <span className="text-foreground font-semibold">{cohort.cohort_name}</span>
        </nav>

        {/* Header */}
        <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold uppercase tracking-widest ${cohort.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {cohort.is_active ? 'Active' : 'Inactive'}
                </span>
                {track && (
                  <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded">
                    {track.code}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-extrabold text-foreground">{cohort.cohort_name}</h1>
              <p className="text-sm font-mono text-muted-foreground mt-0.5">{cohort.cohort_code}</p>
              {cohort.description && (
                <p className="text-sm text-muted-foreground mt-2">{cohort.description}</p>
              )}
              <div className="flex gap-6 mt-4 text-sm text-muted-foreground">
                <span><strong className="text-foreground">{activeCount}</strong> active members</span>
                {withdrawnCount > 0 && (
                  <span><strong className="text-foreground">{withdrawnCount}</strong> withdrawn</span>
                )}
              </div>
            </div>
            <Link
              href={`/admin/cohorts/${cohortId}/enroll`}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-primary/90 transition-colors shrink-0"
            >
              Enroll in Section →
            </Link>
          </div>
        </div>

        {/* Members panel — client component for add/remove */}
        <CohortMemberPanel cohortId={cohortId} members={members as any} />

        {/* Recent enrollment jobs */}
        {jobs.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-foreground mb-4">Recent Enrollment Jobs</h2>
            <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-border">
                  <tr>
                    <th className="text-left px-6 py-3 font-semibold text-muted-foreground">Section</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Type</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Enrolled</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Skipped</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {jobs.map((job) => {
                    const section = job.course_sections as any
                    const blueprint = section?.course_blueprints as any
                    const statusColors: Record<string, string> = {
                      completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      partial:   'bg-amber-50 text-amber-700 border-amber-200',
                      failed:    'bg-rose-50 text-rose-700 border-rose-200',
                      dry_run:   'bg-sky-50 text-sky-700 border-sky-200',
                      processing:'bg-indigo-50 text-indigo-700 border-indigo-200',
                      pending:   'bg-slate-100 text-slate-500 border-slate-200',
                    }
                    return (
                      <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3">
                          <p className="font-medium text-foreground">{blueprint?.title ?? '—'}</p>
                          <p className="text-xs text-muted-foreground font-mono">{section?.section_code ?? ''}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${job.dry_run ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {job.dry_run ? 'Dry run' : 'Live'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusColors[job.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-emerald-700">
                          {(job.result_summary as any)?.enrolled ?? job.processed_count ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-muted-foreground">
                          {(job.result_summary as any)?.skipped ?? job.skipped_count ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
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
