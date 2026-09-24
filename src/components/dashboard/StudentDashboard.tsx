import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getTranslations } from 'next-intl/server'
import SmartSummaryCard from './SmartSummaryCard'
import DashboardCourseCard from './DashboardCourseCard'
import DashboardMessagesPreview from './DashboardMessagesPreview'
import DashboardAnnouncementsPreview from './DashboardAnnouncementsPreview'
import DashboardUpcomingEvents from './DashboardUpcomingEvents'
import DashboardPerformancePanel from './DashboardPerformancePanel'
import DashboardDiplomasSection from './DashboardDiplomasSection'
import AiWeeklySummary from './AiWeeklySummary'
import EngagementWidget from '@/components/engagement/EngagementWidget'
import Leaderboard from '@/components/engagement/Leaderboard'
import type { DashboardContext, EnrolledCourse } from '@/lib/dashboard/context'

function Section({
  title,
  courses,
  emptyText,
  emptyHref,
  emptyLabel,
}: {
  title: string
  courses: EnrolledCourse[]
  emptyText?: string
  emptyHref?: string
  emptyLabel?: string
}) {
  if (courses.length === 0) {
    if (!emptyText) return null
    return (
      <section className="mb-8">
        <h2 className="text-lg font-bold text-foreground mb-3">{title}</h2>
        <div className="bg-white border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground italic mb-3">{emptyText}</p>
          {emptyHref && emptyLabel && (
            <Button asChild variant="outline" size="sm">
              <Link href={emptyHref}>{emptyLabel}</Link>
            </Button>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="mb-8" aria-label={title}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <Badge variant="secondary" className="text-xs">{courses.length}</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((c) => (
          <DashboardCourseCard key={c.enrollmentId} course={c} />
        ))}
      </div>
    </section>
  )
}

export default async function StudentDashboard({ ctx }: { ctx: DashboardContext }) {
  const t = await getTranslations()
  const inProgress = ctx.enrollments.filter((e) => e.transitStatus === 'in_progress')
  const notStarted = ctx.enrollments.filter((e) => e.transitStatus === 'not_started')
  const completed  = ctx.enrollments.filter((e) => e.transitStatus === 'completed')
  const paused     = ctx.enrollments.filter((e) => e.transitStatus === 'paused')
  const tod        = ctx.timeOfDay

  // Morning → dive into active work
  // Afternoon → continue + upcoming
  // Evening → review completed, performance, messages
  // Night → announcements, catch up
  const showPerformanceFirst  = tod === 'evening' || tod === 'night'
  const showEventsFirst       = tod === 'afternoon'
  const showMessagesFirst     = tod === 'night'

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <SmartSummaryCard ctx={ctx} />
        <EngagementWidget uid={ctx.uid} />
        <Leaderboard />
        <AiWeeklySummary uid={ctx.uid} />

        {ctx.enrollments.length === 0 ? (
          <div className="bg-white border border-border rounded-xl p-10 text-center mb-8">
            <p className="text-muted-foreground italic mb-4">
              {t('dashboard.student.emptyEnrollments')}
            </p>
            <Button asChild>
              <Link href="/courses">{t('dashboard.student.browseCoursesButton')}</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Morning / Afternoon: active courses up top */}
            {!showPerformanceFirst && (
              <>
                <Section title={t('dashboard.student.inProgressSection')} courses={inProgress} />
                <Section
                  title={t('dashboard.student.comingUpSection')}
                  courses={notStarted}
                  emptyText={inProgress.length === 0 ? t('dashboard.student.noCoursesStartedEmpty') : undefined}
                  emptyHref="/courses"
                  emptyLabel={t('dashboard.student.browseCoursesButton')}
                />
              </>
            )}

            {/* Afternoon: events next */}
            {showEventsFirst && <DashboardUpcomingEvents isStaff={ctx.isStaff} />}

            {/* Evening / Night: performance snapshot up top */}
            {showPerformanceFirst && (
              <>
                <DashboardPerformancePanel uid={ctx.uid} />
                <Section title={t('dashboard.student.inProgressSection')} courses={inProgress} />
                <Section title={t('dashboard.student.comingUpSection')} courses={notStarted} />
              </>
            )}

            {paused.length  > 0 && <Section title={t('dashboard.student.pausedSection')} courses={paused} />}
            {completed.length > 0 && <Section title={t('status.completed')} courses={completed} />}
          </>
        )}

        <DashboardDiplomasSection uid={ctx.uid} />

        {/* Widgets: order flipped at night */}
        {showMessagesFirst ? (
          <>
            <DashboardMessagesPreview uid={ctx.uid} />
            <DashboardAnnouncementsPreview uid={ctx.uid} isStaff={ctx.isStaff} />
            {!showEventsFirst && <DashboardUpcomingEvents isStaff={ctx.isStaff} />}
            {!showPerformanceFirst && <DashboardPerformancePanel uid={ctx.uid} />}
          </>
        ) : (
          <>
            {!showPerformanceFirst && <DashboardPerformancePanel uid={ctx.uid} />}
            {!showEventsFirst && <DashboardUpcomingEvents isStaff={ctx.isStaff} />}
            <DashboardMessagesPreview uid={ctx.uid} />
            <DashboardAnnouncementsPreview uid={ctx.uid} isStaff={ctx.isStaff} />
          </>
        )}
      </div>
    </main>
  )
}
