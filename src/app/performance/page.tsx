import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface PerformanceRow {
  course_id:          string
  course_title:       string
  enrollment_status:  string
  progress_percent:   number
  average_grade:      number | null
  highest_grade:      number | null
  lowest_grade:       number | null
  letter_grade:       string
  gpa_points:         number | null
  total_submissions:  number
  graded_submissions: number
  total_xp_earned:    number
  is_at_risk:         boolean
  last_accessed_at:   string | null
}

function GradeBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>
  const color =
    pct >= 90 ? 'bg-emerald-500'
    : pct >= 80 ? 'bg-sky-500'
    : pct >= 70 ? 'bg-amber-500'
    : 'bg-rose-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-foreground">{pct}%</span>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    in_progress: 'bg-sky-100 text-sky-700',
    completed:   'bg-emerald-100 text-emerald-700',
    not_started: 'bg-slate-100 text-slate-600',
    paused:      'bg-amber-100 text-amber-700',
    dropped:     'bg-rose-100 text-rose-700',
  }
  const label = status.replace(/_/g, ' ')
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {label}
    </span>
  )
}

export default async function PerformancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data, error } = await supabase.rpc('get_my_academic_performance')
  if (error) console.error('[performance]', error)

  const rows = (data ?? []) as PerformanceRow[]

  const withGrades    = rows.filter((r) => r.gpa_points !== null)
  const overallGpa    = withGrades.length
    ? withGrades.reduce((sum, r) => sum + (r.gpa_points ?? 0), 0) / withGrades.length
    : null
  const totalXp       = rows.reduce((sum, r) => sum + r.total_xp_earned, 0)
  const atRiskCount   = rows.filter((r) => r.is_at_risk).length
  const completedCount = rows.filter((r) => r.enrollment_status === 'completed').length

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-foreground">Academic Performance</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your grades, progress, and standing across all enrolled courses.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="bg-white border border-border rounded-xl px-5 py-4">
            <span className="text-3xl font-extrabold text-foreground">
              {overallGpa !== null ? overallGpa.toFixed(2) : '—'}
            </span>
            <p className="text-xs text-muted-foreground mt-1">Overall GPA</p>
          </div>
          <div className="bg-white border border-border rounded-xl px-5 py-4">
            <span className="text-3xl font-extrabold text-foreground">{rows.length}</span>
            <p className="text-xs text-muted-foreground mt-1">Enrolled Courses</p>
          </div>
          <div className="bg-white border border-emerald-200 rounded-xl px-5 py-4">
            <span className="text-3xl font-extrabold text-emerald-700">{completedCount}</span>
            <p className="text-xs text-muted-foreground mt-1">Completed</p>
          </div>
          <div className={`bg-white rounded-xl px-5 py-4 border ${atRiskCount > 0 ? 'border-rose-200' : 'border-border'}`}>
            <span className={`text-3xl font-extrabold ${atRiskCount > 0 ? 'text-rose-600' : 'text-foreground'}`}>
              {atRiskCount}
            </span>
            <p className="text-xs text-muted-foreground mt-1">At-Risk</p>
          </div>
        </div>

        {/* XP bar */}
        {totalXp > 0 && (
          <div className="bg-white border border-border rounded-xl px-5 py-4 mb-8 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Total XP Earned</p>
              <p className="text-xs text-muted-foreground">Across all courses</p>
            </div>
            <span className="text-2xl font-extrabold text-primary">{totalXp.toLocaleString()} XP</span>
          </div>
        )}

        {/* At-risk alert */}
        {atRiskCount > 0 && (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-rose-700 font-semibold text-sm">
              ⚠ {atRiskCount} course{atRiskCount > 1 ? 's are' : ' is'} flagged at-risk.
              Contact your instructor or catch up on missing work.
            </p>
          </div>
        )}

        {/* Course table */}
        {rows.length === 0 ? (
          <div className="bg-white border border-border rounded-xl p-10 text-center">
            <p className="text-muted-foreground italic mb-4">No enrollment data yet.</p>
            <Link href="/courses" className="text-sm font-semibold text-primary hover:underline">
              Browse courses →
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Course</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Avg Grade</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">GPA</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Submissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.course_id} className={`hover:bg-muted/10 transition-colors ${row.is_at_risk ? 'bg-rose-50/30' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {row.is_at_risk && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                        )}
                        <div>
                          <Link
                            href={`/courses/${row.course_id}`}
                            className="font-semibold text-foreground hover:text-primary transition-colors"
                          >
                            {row.course_title}
                          </Link>
                          {row.total_xp_earned > 0 && (
                            <p className="text-xs text-muted-foreground">{row.total_xp_earned} XP</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill status={row.enrollment_status} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${row.progress_percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{row.progress_percent}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <GradeBar pct={row.average_grade} />
                        {row.average_grade !== null && (
                          <span className="text-xs font-bold text-muted-foreground">({row.letter_grade})</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <span className="font-semibold text-foreground">
                        {row.gpa_points !== null ? row.gpa_points.toFixed(1) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell text-muted-foreground">
                      {row.graded_submissions}/{row.total_submissions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
