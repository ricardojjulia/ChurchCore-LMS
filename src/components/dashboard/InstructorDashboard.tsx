import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import SmartSummaryCard from './SmartSummaryCard'
import DashboardCourseCard from './DashboardCourseCard'
import DashboardMessagesPreview from './DashboardMessagesPreview'
import DashboardAnnouncementsPreview from './DashboardAnnouncementsPreview'
import DashboardUpcomingEvents from './DashboardUpcomingEvents'
import InstructorActionPanel from './InstructorActionPanel'
import Leaderboard from '@/components/engagement/Leaderboard'
import type { DashboardContext } from '@/lib/dashboard/context'
import { cn } from '@/lib/utils'

function StatChip({
  label,
  value,
  className,
}: {
  label: string
  value: number | string
  className?: string
}) {
  return (
    <div className={cn('card-crisp flex flex-col items-center justify-center px-5 py-4', className)}>
      <span className="text-2xl font-display font-bold text-white">{value}</span>
      <span className="text-xs text-slate-400 mt-0.5">{label}</span>
    </div>
  )
}

export default async function InstructorDashboard({ ctx }: { ctx: DashboardContext }) {
  const t = await getTranslations('dashboard.summary')
  const publishedCourses = ctx.ownedCourses.filter((c) => c.isPublished)
  const draftCourses     = ctx.ownedCourses.filter((c) => !c.isPublished)

  return (
    <main className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-5xl mx-auto">
        <SmartSummaryCard ctx={ctx} />

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatChip label={t('courses')} value={ctx.ownedCourses.length} />
          <StatChip label={t('published')} value={publishedCourses.length} className="border-emerald-800/70 text-emerald-400" />
          <StatChip label={t('drafts')} value={draftCourses.length} className="border-amber-800/70 text-amber-300" />
          <StatChip label={t('alsoEnrolledIn')} value={ctx.enrollments.length} className="border-indigo-800/70 text-indigo-300" />
        </div>

        {/* Managed courses */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-display font-bold text-white">{t('yourCourses')}</h2>
            <Button asChild size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
              <Link href="/courses/new">{t('newCourseButton')}</Link>
            </Button>
          </div>

          {ctx.ownedCourses.length === 0 ? (
            <div className="card-crisp p-10 text-center">
              <p className="text-slate-400 italic mb-4">{t('noCoursesYet')}</p>
              <Button asChild className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                <Link href="/courses/new">{t('createFirstCourse')}</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ctx.ownedCourses.map((c) => (
                <div key={c.id} className="card-crisp overflow-hidden hover:border-indigo-500/50 hover:shadow-lg transition-all flex flex-col justify-between">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-white leading-snug">{c.title}</h3>
                      <Badge
                        variant="outline"
                        className={cn(
                          'shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md border',
                          c.isPublished
                            ? 'bg-emerald-950/70 text-emerald-400 border-emerald-800/70'
                            : 'bg-amber-950/70 text-amber-300 border-amber-800/70'
                        )}
                      >
                        {c.isPublished ? t('published') : t('drafts')}
                      </Badge>
                    </div>
                    {c.description && (
                      <p className="text-sm text-slate-400 line-clamp-2">{c.description}</p>
                    )}
                  </div>
                  <div className="border-t border-slate-800/80 px-5 py-3 bg-slate-950/40 flex gap-3 text-xs font-semibold">
                    <Link
                      href={`/courses/${c.id}`}
                      className="text-amber-300 hover:text-amber-200 transition-colors"
                    >
                      {t('view')} →
                    </Link>
                    <Link
                      href={`/courses/${c.id}/edit`}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/courses/${c.id}/build`}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      {t('builder')}
                    </Link>
                    <Link
                      href={`/courses/${c.id}/analytics`}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      {t('analytics')}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <InstructorActionPanel uid={ctx.uid} courseIds={ctx.ownedCourses.map((c) => c.id)} />
        <Leaderboard />
        <DashboardUpcomingEvents isStaff={ctx.isStaff} />
        <DashboardMessagesPreview uid={ctx.uid} />
        <DashboardAnnouncementsPreview uid={ctx.uid} isStaff={ctx.isStaff} />

        {/* Also enrolled in (as a student) */}
        {ctx.enrollments.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-display font-bold text-white mb-3">
              {t('alsoEnrolledIn')}
              <span className="text-sm font-normal text-slate-400 ml-2">(as student)</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ctx.enrollments.map((e) => (
                <DashboardCourseCard key={e.enrollmentId} course={e} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
