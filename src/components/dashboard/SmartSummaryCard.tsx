'use client'

import { useTranslations } from 'next-intl'
import type { DashboardContext } from '@/lib/dashboard/context'

export default function SmartSummaryCard({ ctx }: { ctx: DashboardContext }) {
  const t = useTranslations('dashboard.summary')
  const inProgress = ctx.enrollments.filter((e) => e.transitStatus === 'in_progress')
  const notStarted = ctx.enrollments.filter((e) => e.transitStatus === 'not_started')
  const completed  = ctx.enrollments.filter((e) => e.transitStatus === 'completed')

  const h = new Date().getHours()
  const greetingText =
    h >= 5 && h < 12
      ? t('greetingMorning', { name: ctx.displayName })
      : h >= 12 && h < 18
      ? t('greetingAfternoon', { name: ctx.displayName })
      : t('greetingEvening', { name: ctx.displayName })

  const bullets: string[] = []

  if (ctx.isStaff) {
    if (ctx.ownedCourses.length > 0)
      bullets.push(t('managedCoursesTemplate', { n: ctx.ownedCourses.length }))
    if (ctx.enrollments.length > 0)
      bullets.push(t('enrolledCoursesTemplate', { n: ctx.enrollments.length }))
  } else {
    if (inProgress.length > 0)
      bullets.push(t('inProgressCoursesTemplate', { n: inProgress.length }))
    if (notStarted.length > 0)
      bullets.push(t('waitingCoursesTemplate', { n: notStarted.length }))
    if (completed.length > 0)
      bullets.push(t('completedCoursesTemplate', { n: completed.length }))
    if (ctx.unreadCount > 0)
      bullets.push(t('unreadNotificationsTemplate', { n: ctx.unreadCount }))
    if (bullets.length === 0)
      bullets.push(t('noActiveCourses'))
  }

  return (
    <div className="card-crisp px-6 py-5 mb-6">
      <p className="text-xl font-display font-bold text-white tracking-tight">
        {greetingText}
      </p>
      <p className="text-sm text-slate-400 mt-1">
        {bullets.join(' · ')}
      </p>
      <div className="flex items-center gap-3 mt-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800/70 text-xs font-bold uppercase tracking-wider">
          {ctx.role}
        </span>
        <span className="text-xs font-semibold text-amber-300">
          Level {ctx.currentLevel} · {ctx.xpPoints} XP
        </span>
      </div>
    </div>
  )
}
