import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import SmartSummaryCard from './SmartSummaryCard'
import DashboardCourseCard from './DashboardCourseCard'
import DashboardMessagesPreview from './DashboardMessagesPreview'
import DashboardAnnouncementsPreview from './DashboardAnnouncementsPreview'
import DashboardUpcomingEvents from './DashboardUpcomingEvents'
import InstructorActionPanel from './InstructorActionPanel'
import type { DashboardContext } from '@/lib/dashboard/context'
import type { SystemHealthCheck } from '@/types/health'
import { cn } from '@/lib/utils'

function HealthWidget({ checks }: { checks: SystemHealthCheck[] }) {
  const errorCount   = checks.filter((c) => c.status === 'error').length
  const warningCount = checks.filter((c) => c.status === 'warning').length
  const hasIssues    = errorCount > 0 || warningCount > 0

  return (
    <Link
      href="/admin/health"
      className={cn(
        'flex items-center justify-between rounded-xl border px-5 py-4 transition-all hover:shadow-sm',
        errorCount > 0
          ? 'bg-rose-50 border-rose-200 hover:border-rose-300'
          : warningCount > 0
            ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
            : 'bg-emerald-50 border-emerald-200 hover:border-emerald-300'
      )}
    >
      <div>
        <p className="text-sm font-bold text-foreground">System Health</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {checks.length === 0
            ? 'No checks run yet'
            : hasIssues
              ? `${errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : ''}${errorCount > 0 && warningCount > 0 ? ', ' : ''}${warningCount > 0 ? `${warningCount} warning${warningCount > 1 ? 's' : ''}` : ''}`
              : 'All systems operational'}
        </p>
      </div>
      {hasIssues && (
        <span className={cn(
          'text-xs font-bold px-2.5 py-1 rounded-full',
          errorCount > 0
            ? 'bg-rose-500 text-white'
            : 'bg-amber-400 text-white'
        )}>
          {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : `${warningCount} warn`}
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
      'flex flex-col justify-between rounded-xl border bg-white px-5 py-4 h-24',
      href && 'hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer',
      className
    )}>
      <span className="text-3xl font-extrabold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

export default function AdminDashboard({
  ctx,
  healthChecks = [],
}: {
  ctx:           DashboardContext
  healthChecks?: SystemHealthCheck[]
}) {
  const stats = ctx.stats

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <SmartSummaryCard ctx={ctx} />

        {/* System health widget */}
        <section className="mb-6">
          <HealthWidget checks={healthChecks} />
        </section>

        {/* Institution stats */}
        {stats && (
          <section className="mb-8">
            <h2 className="text-lg font-bold text-foreground mb-3">Institution Overview</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Users"    value={stats.totalUsers}    href="/admin/users" className="border-slate-200" />
              <StatCard label="Students"       value={stats.totalStudents} className="border-emerald-200" />
              <StatCard label="Teachers"       value={stats.totalTeachers} className="border-sky-200" />
              <StatCard label="Total Courses"  value={stats.totalCourses}  href="/courses"     className="border-indigo-200" />
            </div>
          </section>
        )}

        {/* Quick actions */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-foreground mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Button asChild><Link href="/courses/new">+ New Course</Link></Button>
            <Button asChild variant="outline"><Link href="/admin/users">Manage Users</Link></Button>
            <Button asChild variant="outline"><Link href="/hq">Project HQ</Link></Button>
          </div>
        </section>

        {/* Managed courses */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-foreground">Your Courses</h2>
            {ctx.ownedCourses.length > 0 && (
              <Badge variant="secondary" className="text-xs">{ctx.ownedCourses.length}</Badge>
            )}
          </div>

          {ctx.ownedCourses.length === 0 ? (
            <div className="bg-white border border-border rounded-xl p-8 text-center">
              <p className="text-muted-foreground italic mb-3">No courses yet.</p>
              <Button asChild size="sm">
                <Link href="/courses/new">Create a course</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ctx.ownedCourses.map((c) => (
                <div key={c.id} className="bg-white border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-md transition-all">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-foreground leading-snug">{c.title}</h3>
                      <Badge
                        variant="outline"
                        className={cn(
                          'shrink-0 text-xs font-bold',
                          c.isPublished
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        )}
                      >
                        {c.isPublished ? 'Live' : 'Draft'}
                      </Badge>
                    </div>
                    {c.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                    )}
                  </div>
                  <div className="border-t border-border px-5 py-3 bg-muted/20 flex gap-3">
                    <Link href={`/courses/${c.id}`} className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors">View →</Link>
                    <Link href={`/courses/${c.id}/edit`} className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">Edit</Link>
                    <Link href={`/courses/${c.id}/build`} className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">Builder</Link>
                    <Link href={`/courses/${c.id}/analytics`} className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">Analytics</Link>
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
            <h2 className="text-lg font-bold text-foreground mb-3">
              Also Enrolled In
              <span className="text-sm font-normal text-muted-foreground ml-2">(as student)</span>
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
