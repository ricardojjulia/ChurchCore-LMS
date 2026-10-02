import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

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
  if (pct === null) return <span className="text-xs text-slate-500">—</span>
  const color =
    pct >= 90 ? 'bg-emerald-500'
    : pct >= 80 ? 'bg-indigo-500'
    : pct >= 70 ? 'bg-amber-500'
    : 'bg-rose-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-white">{pct}%</span>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    in_progress: 'bg-indigo-950/80 text-indigo-300 border border-indigo-800',
    completed:   'bg-emerald-950/80 text-emerald-300 border border-emerald-800',
    not_started: 'bg-slate-800 text-slate-400 border border-slate-700',
    paused:      'bg-amber-950/80 text-amber-300 border border-amber-800',
    dropped:     'bg-rose-950/80 text-rose-300 border border-rose-800',
  }
  const label = status.replace(/_/g, ' ')
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${map[status] ?? 'bg-slate-800 text-slate-400'}`}>
      {label}
    </span>
  )
}

export default async function PerformancePage() {
  const t = await getTranslations()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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
    <main className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-white tracking-tight font-display">{t('performance.heading')}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {t('performance.subtitle')}
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="card-crisp px-5 py-4">
            <span className="text-3xl font-extrabold text-white">
              {overallGpa !== null ? overallGpa.toFixed(2) : '—'}
            </span>
            <p className="text-xs text-slate-400 mt-1">{t('performance.gpaLabel')}</p>
          </div>
          <div className="card-crisp px-5 py-4">
            <span className="text-3xl font-extrabold text-white">{rows.length}</span>
            <p className="text-xs text-slate-400 mt-1">{t('performance.enrolledCoursesLabel')}</p>
          </div>
          <div className="card-crisp border-emerald-800/70 px-5 py-4">
            <span className="text-3xl font-extrabold text-emerald-400">{completedCount}</span>
            <p className="text-xs text-slate-400 mt-1">{t('status.completed')}</p>
          </div>
          <div className={`card-crisp px-5 py-4 ${atRiskCount > 0 ? 'border-rose-800/70 bg-rose-950/30' : ''}`}>
            <span className={`text-3xl font-extrabold ${atRiskCount > 0 ? 'text-rose-400' : 'text-white'}`}>
              {atRiskCount}
            </span>
            <p className="text-xs text-slate-400 mt-1">{t('performance.atRiskLabel')}</p>
          </div>
        </div>

        {/* XP bar */}
        {totalXp > 0 && (
          <div className="card-crisp px-5 py-4 mb-8 flex items-center justify-between border-indigo-800/60 bg-indigo-950/30">
            <div>
              <p className="text-sm font-semibold text-white">{t('performance.totalXpLabel')}</p>
              <p className="text-xs text-slate-400">{t('performance.xpSublabel')}</p>
            </div>
            <span className="text-2xl font-extrabold text-amber-300">{totalXp.toLocaleString()} XP</span>
          </div>
        )}

        {/* At-risk alert */}
        {atRiskCount > 0 && (
          <div className="mb-6 rounded-xl border border-rose-800/70 bg-rose-950/40 px-4 py-3">
            <p className="text-rose-300 font-semibold text-sm">
              {t('performance.atRiskAlertTemplate', { n: atRiskCount })}
            </p>
          </div>
        )}

        {/* Course table */}
        {rows.length === 0 ? (
          <div className="card-crisp p-10 text-center">
            <p className="text-slate-400 italic mb-4">{t('performance.emptyState')}</p>
            <Link href="/courses" className="text-sm font-semibold text-amber-300 hover:text-amber-200 transition-colors">
              {t('common.browseCoursesArrowLink')}
            </Link>
          </div>
        ) : (
          <div className="card-crisp overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">{t('performance.table.courseHeader')}</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">{t('performance.table.statusHeader')}</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">{t('performance.table.progressHeader')}</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">{t('performance.table.avgGradeHeader')}</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wide hidden sm:table-cell">{t('performance.table.gpaHeader')}</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wide hidden md:table-cell">{t('performance.table.submissionsHeader')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((row) => (
                  <tr key={row.course_id} className={`hover:bg-slate-800/40 transition-colors ${row.is_at_risk ? 'bg-rose-950/20' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {row.is_at_risk && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                        )}
                        <div>
                          <Link
                            href={`/courses/${row.course_id}`}
                            className="font-semibold text-white hover:text-amber-300 transition-colors"
                          >
                            {row.course_title}
                          </Link>
                          {row.total_xp_earned > 0 && (
                            <p className="text-xs text-slate-400">{row.total_xp_earned} XP</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill status={row.enrollment_status} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${row.progress_percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">{row.progress_percent}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <GradeBar pct={row.average_grade} />
                        {row.average_grade !== null && (
                          <span className="text-xs font-bold text-slate-400">({row.letter_grade})</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <span className="font-semibold text-white">
                        {row.gpa_points !== null ? row.gpa_points.toFixed(1) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell text-slate-400">
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
