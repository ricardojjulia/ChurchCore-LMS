import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'

interface PerformanceRow {
  course_id:         string
  course_title:      string
  average_grade:     number | null
  letter_grade:      string
  gpa_points:        number | null
  total_submissions: number
  progress_percent:  number
  is_at_risk:        boolean
}

function GradeChip({ letter, avg }: { letter: string; avg: number | null }) {
  const colorClass =
    avg === null         ? 'bg-slate-800 text-slate-400 border border-slate-700'
    : avg >= 90          ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/70'
    : avg >= 80          ? 'bg-indigo-950/70 text-indigo-300 border border-indigo-800/70'
    : avg >= 70          ? 'bg-amber-950/70 text-amber-300 border border-amber-800/70'
    : 'bg-rose-950/70 text-rose-400 border border-rose-800/70'

  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${colorClass}`}>
      {avg !== null ? `${letter} (${avg}%)` : 'No grades yet'}
    </span>
  )
}

export default async function DashboardPerformancePanel({ uid: _uid }: { uid: string }) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_my_academic_performance')

  if (error || !data?.length) return null

  const rows = data as PerformanceRow[]
  const atRisk = rows.filter((r) => r.is_at_risk)

  const overallGpa = rows
    .filter((r) => r.gpa_points !== null)
    .reduce((acc, r, _, arr) => acc + (r.gpa_points ?? 0) / arr.length, 0)

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display font-bold text-white">Academic Performance</h2>
        <Link
          href="/performance"
          className="text-sm font-semibold text-amber-300 hover:text-amber-200 transition-colors"
        >
          Full report →
        </Link>
      </div>

      {atRisk.length > 0 && (
        <div className="mb-3 rounded-xl border border-rose-800/80 bg-rose-950/30 px-4 py-3 flex items-center gap-2">
          <span className="text-rose-300 font-semibold text-sm">
            ⚠ {atRisk.length} course{atRisk.length > 1 ? 's' : ''} need{atRisk.length === 1 ? 's' : ''} attention
          </span>
        </div>
      )}

      <div className="card-crisp overflow-hidden">
        {rows.length > 0 && (
          <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Overall GPA</span>
            <span className="text-sm font-bold text-amber-300">
              {overallGpa > 0 ? overallGpa.toFixed(2) : '—'}
            </span>
          </div>
        )}

        <ul className="divide-y divide-slate-800/80">
          {rows.slice(0, 4).map((row) => (
            <li key={row.course_id} className="px-5 py-3 flex items-center gap-3">
              {row.is_at_risk && (
                <span className="shrink-0 w-2 h-2 rounded-full bg-rose-500" />
              )}
              {!row.is_at_risk && (
                <span className="shrink-0 w-2 h-2 rounded-full bg-emerald-400" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-100 truncate">{row.course_title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="h-1.5 w-16 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${row.progress_percent}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400">{row.progress_percent}% done</span>
                </div>
              </div>
              <GradeChip letter={row.letter_grade} avg={row.average_grade} />
            </li>
          ))}
        </ul>

        {rows.length > 4 && (
          <div className="px-5 py-2 border-t border-slate-800/80 text-center">
            <Link href="/performance" className="text-xs font-semibold text-amber-300 hover:text-amber-200 transition-colors">
              +{rows.length - 4} more courses
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
