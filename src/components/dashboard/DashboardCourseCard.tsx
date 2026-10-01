'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { EnrolledCourse, TransitStatus } from '@/lib/dashboard/context'
import { cn } from '@/lib/utils'

const TRANSIT_COLOR: Record<TransitStatus, string> = {
  not_started: 'text-slate-400',
  in_progress: 'text-indigo-400 font-semibold',
  completed:   'text-emerald-400 font-semibold',
  dropped:     'text-rose-400 font-semibold',
  paused:      'text-amber-300 font-semibold',
}

const TRANSIT_BAR: Record<TransitStatus, string> = {
  not_started: 'bg-slate-800',
  in_progress: 'bg-indigo-500',
  completed:   'bg-emerald-500',
  dropped:     'bg-rose-500',
  paused:      'bg-amber-400',
}

export default function DashboardCourseCard({ course }: { course: EnrolledCourse }) {
  const t = useTranslations()
  const href = `/courses/${course.courseId}`
  const pct  = Math.min(100, Math.max(0, Math.round(course.progressPercent)))

  const statusLabel =
    course.transitStatus === 'not_started'
      ? t('dashboard.student.comingUpSection')
      : course.transitStatus === 'in_progress'
      ? t('status.inProgress')
      : course.transitStatus === 'completed'
      ? t('status.completed')
      : course.transitStatus === 'dropped'
      ? t('status.dropped')
      : t('dashboard.student.pausedSection')

  const ctaLabel =
    course.transitStatus === 'not_started'
      ? `${t('courses.detail.ctaStart')} →`
      : course.transitStatus === 'in_progress'
      ? `${t('courses.detail.ctaContinue')} →`
      : course.transitStatus === 'completed'
      ? `${t('courses.detail.ctaReview')} →`
      : `${t('dashboard.summary.continue')} →`

  return (
    <div className="card-crisp overflow-hidden hover:border-indigo-500/50 hover:shadow-lg transition-all duration-200 flex flex-col group">
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-white group-hover:text-amber-300 leading-snug line-clamp-2 transition-colors">{course.title}</h3>
          <span className={cn('text-xs font-semibold shrink-0 mt-0.5', TRANSIT_COLOR[course.transitStatus])}>
            {statusLabel}
          </span>
        </div>

        {course.description && (
          <p className="text-sm text-slate-400 line-clamp-2 mb-3">{course.description}</p>
        )}

        {/* Progress bar */}
        {course.transitStatus !== 'not_started' && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">{t('courses.detail.progressBarLabel')}</span>
              <span className="text-xs font-semibold text-slate-200">{pct}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-300', TRANSIT_BAR[course.transitStatus])}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800/80 px-5 py-3 bg-slate-950/40 flex items-center justify-between">
        <Link
          href={href}
          className="text-xs font-semibold text-amber-300 hover:text-amber-200 transition-colors flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  )
}
