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
import OnboardingChecklist from './OnboardingChecklist'
import TrialBanner from './TrialBanner'
import type { DashboardContext } from '@/lib/dashboard/context'
import type { SystemHealthCheck } from '@/types/health'
import { cn } from '@/lib/utils'

function HealthWidget({ checks, t }: { checks: SystemHealthCheck[]; t: any }) {
  const errorCount   = checks.filter((c) => c.status === 'error').length
  const warningCount = checks.filter((c) => c.status === 'warning').length
  const hasIssues    = errorCount > 0 || warningCount > 0

  return (
    <Link
      href="/admin/health"
      className={cn(
        'card-crisp flex items-center justify-between px-5 py-4 transition-all hover:shadow-md',
        errorCount > 0
          ? 'border-rose-800/60 hover:border-rose-600 bg-rose-950/20'
          : warningCount > 0
            ? 'border-amber-800/60 hover:border-amber-600 bg-amber-950/20'
            : 'border-emerald-800/60 hover:border-emerald-600 bg-emerald-950/20'
      )}
    >
      <div>
        <p className="text-sm font-bold text-white">{t('systemHealth')}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {checks.length === 0
            ? t('noChecksRun')
            : hasIssues
              ? `${errorCount > 0 ? t('errorCountTemplate', { n: errorCount }) : ''}${errorCount > 0 && warningCount > 0 ? ', ' : ''}${warningCount > 0 ? t('warningCountTemplate', { n: warningCount }) : ''}`
              : t('allSystemsOperational')}
        </p>
      </div>
      {hasIssues && (
        <span className={cn(
          'text-xs font-bold px-2.5 py-1 rounded-lg border',
          errorCount > 0
            ? 'bg-rose-950 text-rose-300 border-rose-800'
            : 'bg-amber-950 text-amber-300 border-amber-800'
        )}>
          {errorCount > 0 ? t('errorCountTemplate', { n: errorCount }) : t('warningCountTemplate', { n: warningCount })}
        </span>
      )}
    </Link>
  )
}

function StatCard({
  label,
  value,
  href,
  className,
}: {
  label: string
  value: number
  href?: string
  className?: string
}) {
  const inner = (
    <div className={cn(
      'card-crisp flex flex-col justify-between px-5 py-4 h-24 hover:border-indigo-500/50 hover:shadow-md transition-all',
      href && 'cursor-pointer',
      className
    )}>
      <span className="text-3xl font-display font-bold text-white">{value}</span>
      <span className="text-xs text-slate-400 font-medium">{label}</span>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

export default async function AdminDashboard({
  ctx,
  healthChecks = [],
  onboarding,
  trialEndsAt = null,
}: {
  ctx:           DashboardContext
  trialEndsAt?:  string | null
  healthChecks?: SystemHealthCheck[]
  onboarding?:   { logo_uploaded: boolean; first_teacher_invited: boolean; first_course_created: boolean; first_announcement_published: boolean } | null
}) {
  const t = await getTranslations('dashboard.summary')
  const stats = ctx.stats

  return (
    <main className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-5xl mx-auto">
        {trialEndsAt && <TrialBanner trialEndsAt={trialEndsAt} />}
        <SmartSummaryCard ctx={ctx} />

        {/* Onboarding checklist — auto-hides when 100% complete */}
        {onboarding && (
          <section className="mb-6">
            <OnboardingChecklist progress={onboarding} />
          </section>
        )}

        {/* System health widget */}
        <section className="mb-6">
          <HealthWidget checks={healthChecks} t={t} />
        </section>

        {/* Institution stats */}
        {stats && (
          <section className="mb-8">
            <h2 className="text-lg font-display font-bold text-white mb-3">{t('institutionOverview')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label={t('totalUsers')}    value={stats.totalUsers}    href="/admin/users" />
              <StatCard label={t('students')}       value={stats.totalStudents} />
              <StatCard label={t('teachers')}       value={stats.totalTeachers} />
              <StatCard label={t('totalCourses')}  value={stats.totalCourses}  href="/courses" />
            </div>
          </section>
        )}

        {/* Quick actions */}
        <section className="mb-8">
          <h2 className="text-lg font-display font-bold text-white mb-3">{t('quickActions')}</h2>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"><Link href="/courses/new">{t('newCourseButton')}</Link></Button>
            <Button asChild variant="outline" className="border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900"><Link href="/admin/users">{t('manageUsers')}</Link></Button>
          </div>
        </section>

        {/* Managed courses */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-display font-bold text-white">{t('yourCourses')}</h2>
            {ctx.ownedCourses.length > 0 && (
              <Badge variant="secondary" className="text-xs bg-slate-800 text-slate-300">{ctx.ownedCourses.length}</Badge>
            )}
          </div>

          {ctx.ownedCourses.length === 0 ? (
            <div className="card-crisp p-8 text-center">
              <p className="text-slate-400 italic mb-3">{t('noCoursesYet')}</p>
              <Button asChild size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                <Link href="/courses/new">{t('createACourse')}</Link>
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
                    <Link href={`/courses/${c.id}`} className="text-amber-300 hover:text-amber-200 transition-colors">{t('view')} →</Link>
                    <Link href={`/courses/${c.id}/edit`} className="text-slate-400 hover:text-white transition-colors">Edit</Link>
                    <Link href={`/courses/${c.id}/build`} className="text-slate-400 hover:text-white transition-colors">{t('builder')}</Link>
                    <Link href={`/courses/${c.id}/analytics`} className="text-slate-400 hover:text-white transition-colors">{t('analytics')}</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <InstructorActionPanel uid={ctx.uid} courseIds={ctx.ownedCourses.map((c) => c.id)} />
        <DashboardUpcomingEvents isStaff={ctx.isStaff} />
        <DashboardMessagesPreview uid={ctx.uid} />
        <DashboardAnnouncementsPreview uid={ctx.uid} isStaff={ctx.isStaff} />

        {/* Enrolled as student */}
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
