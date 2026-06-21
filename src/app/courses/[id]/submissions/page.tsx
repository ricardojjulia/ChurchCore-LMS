import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import SubmissionCard from './SubmissionCard'

export const dynamic = 'force-dynamic'

type FilterStatus = 'all' | 'submitted' | 'graded'

export default async function CourseSubmissionsPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ status?: string; block?: string }>
}) {
  const { id: courseId }         = await params
  const { status: sf, block: bf } = await searchParams

  const filterStatus = (sf ?? 'all') as FilterStatus
  const filterBlock  = bf ?? ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, owner_id')
    .eq('id', courseId)
    .single()

  if (!course) notFound()

  if (course.owner_id !== profile.uid && !['admin', 'manager'].includes(profile.role)) {
    redirect('/dashboard')
  }

  // Use get_course_submissions SECURITY DEFINER function
  const { data: allSubmissions, error } = await supabase.rpc('get_course_submissions', {
    p_course_id: courseId,
  })

  if (error) {
    console.error('[submissions]', error)
  }

  type SubRow = {
    submission_id: string
    block_id:      string
    block_title:   string
    block_type:    string
    student_uid:   string
    student_name:  string | null
    student_email: string | null
    status:        string
    content:       Record<string, unknown>
    score:         number | null
    max_score:     number | null
    grade_pct:     number | null
    feedback:      string | null
    submitted_at:  string | null
    graded_at:     string | null
  }

  let rows = (allSubmissions ?? []) as SubRow[]

  // Filters
  if (filterStatus !== 'all') {
    rows = rows.filter((r) => r.status === filterStatus)
  }
  if (filterBlock) {
    rows = rows.filter((r) => r.block_id === filterBlock)
  }

  // Stats
  const total      = (allSubmissions ?? []).length
  const pending    = (allSubmissions ?? []).filter((r: SubRow) => r.status === 'submitted').length
  const graded     = (allSubmissions ?? []).filter((r: SubRow) => r.status === 'graded').length

  // Unique blocks for filter dropdown
  const blocks = [...new Map(
    (allSubmissions ?? []).map((r: SubRow) => [r.block_id, { id: r.block_id, title: r.block_title }])
  ).values()] as { id: string; title: string }[]

  function buildHref(updates: Record<string, string>) {
    const p = new URLSearchParams()
    if (filterStatus !== 'all') p.set('status', filterStatus)
    if (filterBlock)             p.set('block',  filterBlock)
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    return `/courses/${courseId}/submissions?${p.toString()}`
  }

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/courses/${courseId}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← {course.title}
          </Link>
          <h1 className="text-2xl font-extrabold text-foreground mt-1">Submissions</h1>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-3 mb-6">
          {[
            { label: 'Total',   value: total,   className: 'bg-slate-100 text-slate-700 border-slate-200', filter: 'all' },
            { label: 'Pending', value: pending,  className: 'bg-amber-100 text-amber-700 border-amber-200', filter: 'submitted' },
            { label: 'Graded',  value: graded,   className: 'bg-emerald-100 text-emerald-700 border-emerald-200', filter: 'graded' },
          ].map(({ label, value, className, filter }) => (
            <Link
              key={label}
              href={buildHref({ status: filter === 'all' ? '' : filter })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${className} ${filterStatus === filter ? 'ring-2 ring-offset-1 ring-current' : 'opacity-80 hover:opacity-100'}`}
            >
              <span>{value}</span>
              <span className="opacity-70">{label}</span>
            </Link>
          ))}
        </div>

        {/* Block filter */}
        {blocks.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <Link
              href={buildHref({ block: '' })}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${!filterBlock ? 'bg-primary text-primary-foreground border-primary' : 'bg-white border-border text-muted-foreground hover:border-primary/40'}`}
            >
              All activities
            </Link>
            {blocks.map((b) => (
              <Link
                key={b.id}
                href={buildHref({ block: b.id })}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors truncate max-w-[180px] ${filterBlock === b.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-white border-border text-muted-foreground hover:border-primary/40'}`}
              >
                {b.title}
              </Link>
            ))}
          </div>
        )}

        {/* Submission cards */}
        {rows.length === 0 ? (
          <div className="bg-white border border-border rounded-xl p-10 text-center">
            <p className="text-muted-foreground italic">
              {total === 0 ? 'No submissions yet.' : 'No submissions match your filters.'}
            </p>
            {total > 0 && filterStatus !== 'all' && (
              <Link href={buildHref({ status: '' })} className="text-sm text-primary hover:underline mt-2 inline-block">
                Clear filters
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              // Supabase RPC return shape doesn't match SubmissionCard prop type
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <SubmissionCard key={row.submission_id} row={row as any} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
