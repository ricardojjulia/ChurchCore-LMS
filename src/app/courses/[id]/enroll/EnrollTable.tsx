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
    not_started: 'bg-slate-100 text-slate-600',
    in_progress: 'bg-sky-100 text-sky-700',
    completed:   'bg-emerald-100 text-emerald-700',
    paused:      'bg-amber-100 text-amber-700',
    dropped:     'bg-rose-100 text-rose-700',
  }

  return (
    <div>
      {/* Stats bar */}
      <div className="flex gap-3 mb-5">
        {[
          { label: 'Total students', value: students.length, cls: 'text-foreground' },
          { label: 'Enrolled',       value: enrolledCount,   cls: 'text-emerald-700' },
          { label: 'Not enrolled',   value: unenrolledCount, cls: 'text-muted-foreground' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-white border border-border rounded-xl px-4 py-3">
            <p className={`text-2xl font-extrabold ${cls}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground italic py-10 text-sm">
            {query ? 'No students match your search.' : 'No students found.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Student</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Level</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Progress</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => (
                <tr key={s.uid} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-indigo-700">
                          {(s.display_name ?? s.email ?? '?')[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{s.display_name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                      </div>
                    </div>
                    {errors[s.uid] && (
                      <p className="text-xs text-rose-600 mt-1 ml-11">{errors[s.uid]}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs font-semibold text-muted-foreground">Lv {s.current_level}</span>
                  </td>
                  <td className="px-4 py-3">
                    {s.enrolled ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_CHIP[s.transit_status ?? 'not_started'] ?? STATUS_CHIP.not_started}`}>
                        {(s.transit_status ?? 'not_started').replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Not enrolled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {s.enrolled ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${s.progress_percent ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{s.progress_percent ?? 0}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggle(s.uid, s.enrolled)}
                      disabled={pending && loadingUid === s.uid}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${
                        s.enrolled
                          ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                          : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 bg-emerald-50'
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
        <p className="text-xs text-muted-foreground text-center mt-3">
          Showing {filtered.length} of {students.length} students
        </p>
      )}
    </div>
  )
}
