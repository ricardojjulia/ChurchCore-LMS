'use client'

import { useState, useTransition } from 'react'
import { staffEnroll, staffUnenroll } from '@/app/actions/enrollment'

interface Student {
  uid:          string
  display_name: string | null
  email:        string | null
  current_level: number
  enrolled:     boolean
  transit_status?: string
  progress_percent?: number
}

export default function EnrollTable({
  courseId,
  initialStudents,
}: {
  courseId:        string
  initialStudents: Student[]
}) {
  const [query,    setQuery]    = useState('')
  const [students, setStudents] = useState(initialStudents)
  const [pending,  startAction] = useTransition()
  const [loadingUid, setLoadingUid] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const filtered = students.filter((s) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      (s.display_name ?? '').toLowerCase().includes(q) ||
      (s.email        ?? '').toLowerCase().includes(q)
    )
  })

  const enrolledCount   = students.filter((s) => s.enrolled).length
  const unenrolledCount = students.length - enrolledCount

  function toggle(uid: string, currentlyEnrolled: boolean) {
    setLoadingUid(uid)
    setErrors((prev) => { const n = { ...prev }; delete n[uid]; return n })
    startAction(async () => {
      const res = currentlyEnrolled
        ? await staffUnenroll(courseId, uid)
        : await staffEnroll(courseId, uid)

      if (res.error) {
        setErrors((prev) => ({ ...prev, [uid]: res.error! }))
      } else {
        setStudents((prev) =>
          prev.map((s) =>
            s.uid === uid
              ? { ...s, enrolled: !currentlyEnrolled, transit_status: 'not_started', progress_percent: 0 }
              : s
          )
        )
      }
      setLoadingUid(null)
    })
  }

  const STATUS_CHIP: Record<string, string> = {
    not_started: 'bg-slate-800 text-slate-400 border-slate-700',
    in_progress: 'bg-sky-950/60 text-sky-300 border-sky-800/60',
    completed:   'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
    paused:      'bg-amber-950/60 text-amber-300 border-amber-800/60',
    dropped:     'bg-rose-950/60 text-rose-300 border-rose-800/60',
  }

  return (
    <div>
      {/* Stats bar */}
      <div className="flex gap-3 mb-5">
        {[
          { label: 'Total students', value: students.length, cls: 'text-white' },
          { label: 'Enrolled',       value: enrolledCount,   cls: 'text-emerald-400' },
          { label: 'Not enrolled',   value: unenrolledCount, cls: 'text-slate-400' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="card-crisp px-4 py-3">
            <p className={`text-2xl font-extrabold ${cls}`}>{value}</p>
            <p className="text-xs text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input aria-label="Search students"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-4 py-2 text-sm bg-slate-900 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card-crisp overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center text-slate-400 italic py-10 text-sm">
            {query ? 'No students match your search.' : 'No students found.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wide">Student</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wide hidden sm:table-cell">Level</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wide hidden md:table-cell">Progress</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((s) => (
                <tr key={s.uid} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-900/60 border border-indigo-700/60 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-indigo-300">
                          {(s.display_name ?? s.email ?? '?')[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{s.display_name ?? '—'}</p>
                        <p className="text-xs text-slate-400 font-mono truncate">{s.email}</p>
                      </div>
                    </div>
                    {errors[s.uid] && (
                      <p className="text-xs text-rose-400 mt-1 ml-11">{errors[s.uid]}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs font-semibold text-slate-400">Lv {s.current_level}</span>
                  </td>
                  <td className="px-4 py-3">
                    {s.enrolled ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize border ${STATUS_CHIP[s.transit_status ?? 'not_started'] ?? STATUS_CHIP.not_started}`}>
                        {(s.transit_status ?? 'not_started').replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 italic">Not enrolled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {s.enrolled ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${s.progress_percent ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">{s.progress_percent ?? 0}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggle(s.uid, s.enrolled)}
                      disabled={pending && loadingUid === s.uid}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${
                        s.enrolled
                          ? 'border-rose-800/60 text-rose-300 bg-rose-950/40 hover:bg-rose-900/60'
                          : 'border-emerald-800/60 text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60'
                      }`}
                    >
                      {pending && loadingUid === s.uid
                        ? '…'
                        : s.enrolled ? 'Unenroll' : 'Enroll'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-slate-400 text-center mt-3">
          Showing {filtered.length} of {students.length} students
        </p>
      )}
    </div>
  )
}
