import type { DashboardContext } from '@/lib/dashboard/context'

function greeting(name: string): string {
  const h = new Date().getUTCHours()
  if (h >= 5  && h < 12) return `Good morning, ${name}.`
  if (h >= 12 && h < 18) return `Good afternoon, ${name}.`
  return `Good evening, ${name}.`
}

export default function SmartSummaryCard({ ctx }: { ctx: DashboardContext }) {
  const inProgress = ctx.enrollments.filter((e) => e.transitStatus === 'in_progress')
  const notStarted = ctx.enrollments.filter((e) => e.transitStatus === 'not_started')
  const completed  = ctx.enrollments.filter((e) => e.transitStatus === 'completed')

  const bullets: string[] = []

  if (ctx.isStaff) {
    if (ctx.ownedCourses.length > 0)
      bullets.push(`${ctx.ownedCourses.length} course${ctx.ownedCourses.length !== 1 ? 's' : ''} you manage`)
    if (ctx.enrollments.length > 0)
      bullets.push(`${ctx.enrollments.length} course${ctx.enrollments.length !== 1 ? 's' : ''} you're enrolled in`)
  } else {
    if (inProgress.length > 0)
      bullets.push(`${inProgress.length} course${inProgress.length !== 1 ? 's' : ''} in progress`)
    if (notStarted.length > 0)
      bullets.push(`${notStarted.length} course${notStarted.length !== 1 ? 's' : ''} waiting to start`)
    if (completed.length > 0)
      bullets.push(`${completed.length} course${completed.length !== 1 ? 's' : ''} completed`)
    if (ctx.unreadCount > 0)
      bullets.push(`${ctx.unreadCount} unread notification${ctx.unreadCount !== 1 ? 's' : ''}`)
    if (bullets.length === 0)
      bullets.push('No active courses yet — browse the catalog to get started.')
  }

  return (
    <div className="bg-white border border-border rounded-2xl px-6 py-5 mb-6 shadow-sm">
      <p className="text-xl font-extrabold text-foreground tracking-tight">
        {greeting(ctx.displayName)}
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        {bullets.join(' · ')}
      </p>
      <div className="flex items-center gap-3 mt-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
          {ctx.role}
        </span>
        <span className="text-xs text-muted-foreground">
          Level {ctx.currentLevel} · {ctx.xpPoints} XP
        </span>
      </div>
    </div>
  )
}
