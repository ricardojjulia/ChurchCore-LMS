'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
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

const STATUS_META: Record<AttendanceStatus, { color: string; bg: string; border: string }> = {
  present: { color: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-500/30' },
  late:    { color: 'text-amber-400',   bg: 'bg-amber-950/40',   border: 'border-amber-500/30'   },
  absent:  { color: 'text-rose-400',    bg: 'bg-rose-950/40',    border: 'border-rose-500/30'    },
  excused: { color: 'text-slate-400',   bg: 'bg-slate-800',      border: 'border-slate-700'      },
}

export default function AttendancePlayer({ blockId, sessionTitle, trackingMode, points, existingSub }: Props) {
  const t = useTranslations()
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
      <div className="flex items-start gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <span className="text-4xl mt-0.5" aria-hidden="true">🗓️</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-base">{t('learning.attendance.blockTitle')}</p>
          {sessionTitle && (
            <p className="text-sm text-slate-400 mt-0.5">{sessionTitle}</p>
          )}
          {points > 0 && (
            <p className="text-xs text-slate-400 mt-1">{t('learning.attendance.pointsPossibleTemplate', { points })}</p>
          )}
        </div>

        {meta ? (
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full border ${meta.color} ${meta.bg} ${meta.border}`}>
            {status === 'present' ? '✅' : status === 'late' ? '⏰' : status === 'absent' ? '❌' : '🔕'}
            {' '}{status === 'present' ? t('learning.attendance.statusPresent')
              : status === 'late' ? t('learning.attendance.statusLate')
              : status === 'absent' ? t('learning.attendance.statusAbsent')
              : t('learning.attendance.statusExcused')}
          </span>
        ) : autoSent ? (
          <span className="text-xs text-slate-400 italic">{t('learning.attendance.recordingBadge')}</span>
        ) : (
          <span className="text-xs text-slate-400 italic">{t('learning.attendance.unmarkedBadge')}</span>
        )}
      </div>

      {!status && trackingMode === 'manual' && (
        <p className="text-sm text-slate-400 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          {t('learning.attendance.manualNotice')}
        </p>
      )}

      {status === 'present' && trackingMode !== 'manual' && !existingSub && (
        <p className="text-xs text-slate-400 text-center">
          {t('learning.attendance.autoConfirmation')}
        </p>
      )}
    </div>
  )
}
