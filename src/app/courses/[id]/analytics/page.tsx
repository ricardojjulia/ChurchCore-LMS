import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import ExportCsvButton from './ExportCsvButton'

export const dynamic = 'force-dynamic'

interface AnalyticsRow {
  user_id:            string
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
  enrolled_at:        string
}

interface StudentProfile {
  uid:          string
  display_name: string | null
  email:        string | null
}

function GradeBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">No grades</span>
  const color =
    pct >= 90 ? 'bg-emerald-500'
    : pct >= 80 ? 'bg-sky-500'
    : pct >= 70 ? 'bg-amber-500'
    : 'bg-rose-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm text-foreground">{pct}%</span>
    </div>
  )
}

export default async function CourseAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: courseId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Verify course exists and fetch basic info
  const { data: course } = await supabase
    .from('courses')
    .select('id, title, owner_id')
    .eq('id', courseId)
    .single()

  if (!course) notFound()

  // get_course_performance enforces ownership via SECURITY DEFINER
  const { data, error } = await supabase.rpc('get_course_performance', {
    p_course_id: courseId,
  })

  if (error) {
    // RLS rejection → not owner/admin
    if (error.code === 'PGRST116' || error.message?.includes('permission')) {
      redirect('/dashboard')
    }
    console.error('[analytics]', error)
  }

  if (!data?.length) {
    return (
      <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <BackLink courseId={courseId} title={course.title} />
          <div className="bg-white border border-border rounded-xl p-10 text-center">
            <p className="text-muted-foreground italic">No students enrolled yet.</p>
          </div>
        </div>
      </main>
    )
  }

  const rows = data as AnalyticsRow[]

  // Fetch student profiles in one query
  const studentUids = [...new Set(rows.map((r) => r.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('uid, display_name, email')
    .in('uid', studentUids)

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((p: StudentProfile) => [p.uid, p])
  )

  // Aggregate stats
  const atRiskRows     = rows.filter((r) => r.is_at_risk)
  const withGrades     = rows.filter((r) => r.gpa_points !== null)
  const classAvg       = withGrades.length
    ? withGrades.reduce((s, r) => s + (r.average_grade ?? 0), 0) / withGrades.length
    : null
  const classGpa       = withGrades.length
    ? withGrades.reduce((s, r) => s + (r.gpa_points ?? 0), 0) / withGrades.length
    : null
  const completionRate = rows.length
    ? Math.round(rows.filter((r) => r.enrollment_status === 'completed').length / rows.length * 100)
    : 0

  const csvRows = rows.map((r) => {
    const p = profileMap[r.user_id]
    return {
      Name:         p?.display_name ?? r.user_id,
      Email:        p?.email ?? '',
      Status:       r.enrollment_status,
      Progress:     r.progress_percent,
      'Avg Grade':  r.average_grade ?? '',
      'Letter':     r.letter_grade,
      'GPA Points': r.gpa_points ?? '',
      'Submissions':r.graded_submissions,
      'Total Sub':  r.total_submissions,
      'XP':         r.total_xp_earned,
      'At Risk':    r.is_at_risk ? 'Yes' : 'No',
    }
  })

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <BackLink courseId={courseId} title={course.title} />

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          <div className="bg-white border border-border rounded-xl px-4 py-3">
            <span className="text-2xl font-extrabold text-foreground">{rows.length}</span>
            <p className="text-xs text-muted-foreground">Enrolled</p>
          </div>
          <div className="bg-white border border-border rounded-xl px-4 py-3">
            <span className="text-2xl font-extrabold text-foreground">{completionRate}%</span>
            <p className="text-xs text-muted-foreground">Completion</p>
          </div>
          <div className="bg-white border border-border rounded-xl px-4 py-3">
            <span className="text-2xl font-extrabold text-foreground">
              {classAvg !== null ? `${classAvg.toFixed(1)}%` : '—'}
            </span>
            <p className="text-xs text-muted-foreground">Class Avg</p>
          </div>
          <div className="bg-white border border-border rounded-xl px-4 py-3">
            <span className="text-2xl font-extrabold text-foreground">
              {classGpa !== null ? classGpa.toFixed(2) : '—'}
            </span>
            <p className="text-xs text-muted-foreground">Avg GPA</p>
          </div>
          <div className={`bg-white rounded-xl px-4 py-3 border ${atRiskRows.length > 0 ? 'border-rose-300' : 'border-border'}`}>
            <span className={`text-2xl font-extrabold ${atRiskRows.length > 0 ? 'text-rose-600' : 'text-foreground'}`}>
              {atRiskRows.length}
            </span>
            <p className="text-xs text-muted-foreground">At-Risk</p>
          </div>
        </div>

        {/* At-risk alert */}
        {atRiskRows.length > 0 && (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-rose-700 font-semibold text-sm">
              ⚠ {atRiskRows.length} student{atRiskRows.length > 1 ? 's are' : ' is'} at risk —
              low average grade or no activity in 7+ days.
            </p>
          </div>
        )}

        {/* Table header + export */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">Student Results</h2>
          <ExportCsvButton rows={csvRows} filename={`${course.title.replace(/\s+/g, '_')}_analytics.csv`} />
        </div>

        <div className="bg-white border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Student</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Avg Grade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">GPA</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sub</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const profile = profileMap[row.user_id]
                return (
                  <tr
                    key={row.user_id}
                    className={`hover:bg-muted/10 transition-colors ${row.is_at_risk ? 'bg-rose-50/30' : ''}`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {row.is_at_risk && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />}
                        <div>
                          <p className="font-semibold text-foreground">
                            {profile?.display_name ?? 'Unknown'}
                          </p>
                          {profile?.email && (
                            <p className="text-xs text-muted-foreground">{profile.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize
                        ${row.enrollment_status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                        : row.enrollment_status === 'in_progress' ? 'bg-sky-100 text-sky-700'
                        : row.enrollment_status === 'paused' ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'}`}
                      >
                        {row.enrollment_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${row.progress_percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{row.progress_percent}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <GradeBar pct={row.average_grade} />
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {row.gpa_points !== null ? row.gpa_points.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.graded_submissions}/{row.total_submissions}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}

function BackLink({ courseId, title }: { courseId: string; title: string }) {
  return (
    <div className="mb-6">
      <Link
        href={`/courses/${courseId}`}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← {title}
      </Link>
      <h1 className="text-2xl font-extrabold text-foreground mt-1">Course Analytics</h1>
    </div>
  )
}
