'use client'

import { useState, useTransition } from 'react'
import { markStudentAttendance } from '@/app/actions/attendance'

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

interface AttendanceBlock {
  id:           string
  title:        string
  sessionTitle: string | null
  trackingMode: string
  points:       number
}

interface Enrollment {
  id:          string
  authUserId:  string
  displayName: string
}

interface SubmissionRow {
  id:           string
  blockId:      string
  enrollmentId: string
  status:       string | null
  score:        number | null
  maxScore:     number | null
}

interface Props {
  courseId:           string
  blocks:             AttendanceBlock[]
  enrollments:        Enrollment[]
  initialSubmissions: SubmissionRow[]
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; icon: string; color: string }[] = [
  { value: 'present', label: 'Present', icon: '✅', color: 'text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100' },
  { value: 'late',    label: 'Late',    icon: '⏰', color: 'text-amber-700   bg-amber-50   border-amber-300   hover:bg-amber-100'   },
  { value: 'absent',  label: 'Absent',  icon: '❌', color: 'text-rose-700    bg-rose-50    border-rose-300    hover:bg-rose-100'    },
  { value: 'excused', label: 'Excused', icon: '🔕', color: 'text-slate-600   bg-slate-100  border-slate-300   hover:bg-slate-200'   },
]

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  present: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  late:    'text-amber-700   bg-amber-50   border-amber-200',
  absent:  'text-rose-700    bg-rose-50    border-rose-200',
  excused: 'text-slate-600   bg-slate-100  border-slate-200',
}

const STATUS_ICON: Record<AttendanceStatus, string> = {
  present: '✅', late: '⏰', absent: '❌', excused: '🔕',
}

export default function AttendanceManager({
  blocks,
  enrollments,
  initialSubmissions,
}: Props) {
  const [subs, setSubs] = useState<Map<string, SubmissionRow>>(() => {
    const m = new Map<string, SubmissionRow>()
    for (const s of initialSubmissions) m.set(`${s.blockId}:${s.enrollmentId}`, s)
    return m
  })
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [pending, startTransition] = useTransition()
  const [activeCell, setActiveCell] = useState<string | null>(null)

  function getStatus(blockId: string, enrollmentId: string): AttendanceStatus | null {
    return (subs.get(`${blockId}:${enrollmentId}`)?.status as AttendanceStatus) ?? null
  }

  function setError(key: string, msg: string) {
    setErrors((prev) => new Map(prev).set(key, msg))
    setTimeout(() => setErrors((prev) => { const n = new Map(prev); n.delete(key); return n }), 4000)
  }

  function handleMark(
    block: AttendanceBlock,
    enrollment: Enrollment,
    newStatus: AttendanceStatus,
  ) {
    const key = `${block.id}:${enrollment.id}`
    setActiveCell(null)
    startTransition(async () => {
      const res = await markStudentAttendance({
        blockId:          block.id,
        targetAuthId:     enrollment.authUserId,
        attendanceStatus: newStatus,
      })
      if (res.error) {
        setError(key, res.error)
        return
      }
      setSubs((prev) => {
        const next = new Map(prev)
        const existing = prev.get(key)
        next.set(key, {
          id:           existing?.id ?? '',
          blockId:      block.id,
          enrollmentId: enrollment.id,
          status:       newStatus,
          score:        null,
          maxScore:     block.points > 0 ? block.points : null,
        })
        return next
      })
    })
  }

  const attendanceCounts = blocks.map((b) => {
    let present = 0, marked = 0
    for (const e of enrollments) {
      const s = getStatus(b.id, e.id)
      if (s) marked++
      if (s === 'present' || s === 'late') present++
    }
    return { blockId: b.id, present, marked, total: enrollments.length }
  })

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
      {/* Summary row */}
      <div className="border-b border-border bg-slate-50 px-6 py-3 flex gap-6 overflow-x-auto">
        {blocks.map((b, i) => {
          const c = attendanceCounts[i]
          return (
            <div key={b.id} className="flex flex-col min-w-[120px]">
              <p className="text-xs font-semibold text-foreground truncate">{b.sessionTitle ?? b.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {c.present}/{c.total} present · {c.marked}/{c.total} marked
              </p>
            </div>
          )
        })}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky left-0 bg-slate-50/50 min-w-[160px]">
                Student
              </th>
              {blocks.map((b) => (
                <th key={b.id} className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground min-w-[120px]">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-foreground">{b.sessionTitle ?? b.title}</span>
                    {b.points > 0 && (
                      <span className="text-muted-foreground font-normal">{b.points} pts</span>
                    )}
                    <span className="text-[10px] font-normal capitalize text-muted-foreground/70">{b.trackingMode}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={blocks.length + 1} className="text-center py-10 text-muted-foreground text-sm italic">
                  No active students enrolled.
                </td>
              </tr>
            )}
            {enrollments.map((enrollment) => (
              <tr key={enrollment.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground sticky left-0 bg-white">
                  {enrollment.displayName}
                </td>
                {blocks.map((block) => {
                  const key    = `${block.id}:${enrollment.id}`
                  const status = getStatus(block.id, enrollment.id)
                  const error  = errors.get(key)
                  const isOpen = activeCell === key

                  return (
                    <td key={block.id} className="px-3 py-3 text-center relative">
                      {error && (
                        <p className="absolute -top-8 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap z-10">
                          {error}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => setActiveCell(isOpen ? null : key)}
                        disabled={pending}
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full border transition-all ${
                          status
                            ? STATUS_BADGE[status]
                            : 'text-muted-foreground bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                        aria-label={`Mark ${enrollment.displayName} for ${block.sessionTitle ?? block.title}`}
                        aria-expanded={isOpen}
                      >
                        {status ? (
                          <>{STATUS_ICON[status]} {status.charAt(0).toUpperCase() + status.slice(1)}</>
                        ) : (
                          <>— Mark</>
                        )}
                      </button>

                      {isOpen && (
                        <div className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-border rounded-xl shadow-lg p-1.5 flex flex-col gap-0.5 min-w-[130px]">
                          {STATUS_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => handleMark(block, enrollment, opt.value)}
                              className={`flex items-center gap-2 w-full text-left text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${opt.color}`}
                            >
                              <span>{opt.icon}</span>
                              <span>{opt.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {enrollments.length > 0 && (
        <div className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
          Click any cell to mark attendance. Teachers can override auto-tracked entries.
        </div>
      )}
    </div>
  )
}
