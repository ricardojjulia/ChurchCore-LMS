import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'

interface ActionItem {
  label:     string
  detail:    string
  href:      string
  severity:  'high' | 'medium' | 'low'
}

export default async function InstructorActionPanel({
  uid: _uid,
  courseIds,
}: {
  uid:       string
  courseIds: string[]
}) {
  if (courseIds.length === 0) return null

  const supabase = await createClient()

  // Fetch all in parallel: ungraded submissions per course + at-risk students per course
  // Step 1: resolve block IDs for all owned courses
  const { data: ownedBlocks } = await supabase
    .from('course_blocks')
    .select('id, course_id')
    .in('course_id', courseIds)

  const blockIdList = (ownedBlocks ?? []).map((b) => b.id)

  const [{ data: ungradedData }, { data: msgCount }] = await Promise.all([
    // Ungraded (submitted, awaiting grading) submissions
    blockIdList.length > 0
      ? supabase
          .from('block_submissions')
          .select('id, block_id')
          .in('block_id', blockIdList)
          .eq('status', 'submitted')
          .eq('is_deleted', false)
      : Promise.resolve({ data: [] }),

    // Unread message threads
    supabase.rpc('count_unread_message_threads'),
  ])

  // At-risk: fetch course performance for each owned course in parallel (cap 5)
  const courseSlice = courseIds.slice(0, 5)
  const atRiskResults = await Promise.allSettled(
    courseSlice.map((cid) =>
      supabase.rpc('get_course_performance', { p_course_id: cid })
    )
  )
  const atRiskData = atRiskResults.flatMap((r) =>
    r.status === 'fulfilled' ? (r.value.data ?? []).filter((row: { is_at_risk: boolean; user_id: string }) => row.is_at_risk) : []
  )

  const actions: ActionItem[] = []

  // Group ungraded by block → derive course count via ownedBlocks map
  if (ungradedData?.length) {
    const blockToCourse = Object.fromEntries(
      (ownedBlocks ?? []).map((b) => [b.id, b.course_id])
    )
    const courseSet = new Set(ungradedData.map((r) => blockToCourse[r.block_id]).filter(Boolean))
    const total = ungradedData.length
    if (total > 0) {
      actions.push({
        label:    `${total} submission${total > 1 ? 's' : ''} need grading`,
        detail:   `Across ${courseSet.size} course${courseSet.size > 1 ? 's' : ''}`,
        href:     '/courses',
        severity: total > 5 ? 'high' : 'medium',
      })
    }
  }

  // At-risk students
  if (atRiskData.length) {
    const uniqueStudents = new Set(atRiskData.map((r: { user_id: string }) => r.user_id)).size
    actions.push({
      label:    `${uniqueStudents} student${uniqueStudents > 1 ? 's' : ''} at risk`,
      detail:   'Low grades or no activity in 7+ days',
      href:     '/courses',
      severity: 'high',
    })
  }

  // Unread messages
  const unreadMsgs = typeof msgCount === 'number' ? msgCount : 0
  if (unreadMsgs > 0) {
    actions.push({
      label:    `${unreadMsgs} unread message thread${unreadMsgs > 1 ? 's' : ''}`,
      detail:   'Students waiting for a reply',
      href:     '/messages',
      severity: unreadMsgs > 3 ? 'high' : 'low',
    })
  }

  if (actions.length === 0) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-display font-bold text-white mb-3">Action Required</h2>
        <div className="card-crisp border-emerald-800/70 bg-emerald-950/20 px-5 py-4 flex items-center gap-3">
          <span className="text-emerald-400 text-lg">✓</span>
          <p className="text-sm text-emerald-300 font-medium">All caught up — nothing needs your attention right now.</p>
        </div>
      </section>
    )
  }

  const severityColor: Record<ActionItem['severity'], string> = {
    high:   'border-l-rose-500 bg-rose-950/30',
    medium: 'border-l-amber-500 bg-amber-950/30',
    low:    'border-l-indigo-400 bg-indigo-950/30',
  }
  const severityText: Record<ActionItem['severity'], string> = {
    high:   'text-rose-300',
    medium: 'text-amber-300',
    low:    'text-indigo-300',
  }

  return (
    <section className="mb-8" aria-label="Action Required">
      <h2 className="text-lg font-display font-bold text-white mb-3">
        Action Required
        <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold">
          {actions.length}
        </span>
      </h2>
      <div className="flex flex-col gap-2">
        {actions.map((a, i) => (
          <Link
            key={i}
            href={a.href}
            className={`card-crisp border-l-4 px-5 py-3 flex items-center justify-between gap-4 hover:border-indigo-500/50 transition-all ${severityColor[a.severity]}`}
          >
            <div>
              <p className={`text-sm font-semibold ${severityText[a.severity]}`}>{a.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{a.detail}</p>
            </div>
            <span className="text-slate-400 text-sm shrink-0">→</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
