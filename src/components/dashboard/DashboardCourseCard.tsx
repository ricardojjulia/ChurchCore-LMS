import Link from 'next/link'
import type { EnrolledCourse, TransitStatus } from '@/lib/dashboard/context'
import { cn } from '@/lib/utils'

const TRANSIT_LABEL: Record<TransitStatus, string> = {
  not_started: 'Coming Up',
  in_progress: 'In Progress',
  completed:   'Completed',
  dropped:     'Dropped',
  paused:      'Paused',
}

const TRANSIT_COLOR: Record<TransitStatus, string> = {
  not_started: 'text-slate-500',
  in_progress: 'text-sky-600',
  completed:   'text-emerald-600',
  dropped:     'text-rose-500',
  paused:      'text-amber-600',
}

const TRANSIT_BAR: Record<TransitStatus, string> = {
  not_started: 'bg-slate-200',
  in_progress: 'bg-sky-500',
  completed:   'bg-emerald-500',
  dropped:     'bg-rose-400',
  paused:      'bg-amber-400',
}

const CTA_LABEL: Record<TransitStatus, string> = {
  not_started: 'Start →',
  in_progress: 'Continue →',
  completed:   'Review →',
  dropped:     'Re-enroll →',
  paused:      'Resume →',
}

export default function DashboardCourseCard({ course }: { course: EnrolledCourse }) {
  const href = `/courses/${course.courseId}`
  const pct  = Math.min(100, Math.max(0, Math.round(course.progressPercent)))

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-md transition-all flex flex-col">
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-foreground leading-snug line-clamp-2">{course.title}</h3>
          <span className={cn('text-xs font-semibold shrink-0 mt-0.5', TRANSIT_COLOR[course.transitStatus])}>
            {TRANSIT_LABEL[course.transitStatus]}
          </span>
        </div>

        {course.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{course.description}</p>
        )}

        {/* Progress bar */}
        {course.transitStatus !== 'not_started' && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Progress</span>
              <span className="text-xs font-semibold text-foreground">{pct}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', TRANSIT_BAR[course.transitStatus])}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border px-5 py-3 bg-muted/20">
        <Link
          href={href}
          className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          {CTA_LABEL[course.transitStatus]}
        </Link>
      </div>
    </div>
  )
}
