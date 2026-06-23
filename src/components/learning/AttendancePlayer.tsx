'use client'

import { useEffect, useRef, useState } from 'react'
import { markSelfAttendance } from '@/app/actions/attendance'

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

interface Props {
  blockId:      string
  sessionTitle: string | null
  trackingMode: 'auto' | 'manual' | 'both'
  points:       number
  existingSub?: {
    status:  string
    content: Record<string, unknown>
    score:   number | null
  } | null
}

const STATUS_META: Record<AttendanceStatus, { label: string; color: string; bg: string; border: string }> = {
  present: { label: 'Present',  color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
  late:    { label: 'Late',     color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200'   },
  absent:  { label: 'Absent',   color: 'text-rose-700',    bg: 'bg-rose-50',     border: 'border-rose-200'    },
  excused: { label: 'Excused',  color: 'text-slate-600',   bg: 'bg-slate-50',    border: 'border-slate-200'   },
}

export default function AttendancePlayer({ blockId, sessionTitle, trackingMode, points, existingSub }: Props) {
  const marked     = useRef(false)
  const [status,   setStatus]   = useState<AttendanceStatus | null>(
    (existingSub?.content?.attendance_status as AttendanceStatus) ?? null
  )
  const [autoSent, setAutoSent] = useState(false)

  useEffect(() => {
    if (marked.current) return
    if (status) return
    if (!['auto', 'both'].includes(trackingMode)) return
    marked.current = true
    setAutoSent(true)
    markSelfAttendance(blockId).then((res) => {
      if (!res.error) setStatus('present')
    })
  }, [blockId, status, trackingMode])

  const meta = status ? STATUS_META[status] : null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-4 bg-white border border-border rounded-2xl p-6 shadow-sm">
        <span className="text-4xl mt-0.5" aria-hidden="true">🗓️</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground text-base">Attendance</p>
          {sessionTitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{sessionTitle}</p>
          )}
          {points > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{points} point{points !== 1 ? 's' : ''} possible</p>
          )}
        </div>

        {meta ? (
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full border ${meta.color} ${meta.bg} ${meta.border}`}>
            {status === 'present' ? '✅' : status === 'late' ? '⏰' : status === 'absent' ? '❌' : '🔕'} {meta.label}
          </span>
        ) : autoSent ? (
          <span className="text-xs text-muted-foreground italic">Recording…</span>
        ) : (
          <span className="text-xs text-muted-foreground italic">Unmarked</span>
        )}
      </div>

      {!status && trackingMode === 'manual' && (
        <p className="text-sm text-muted-foreground bg-slate-50 border border-border rounded-xl px-4 py-3">
          Your teacher will record your attendance for this session.
        </p>
      )}

      {status === 'present' && trackingMode !== 'manual' && !existingSub && (
        <p className="text-xs text-muted-foreground text-center">
          Your attendance was recorded automatically when you opened this block.
        </p>
      )}
    </div>
  )
}
