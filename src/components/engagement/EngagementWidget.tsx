import { createClient } from '@/utils/supabase/server'

interface EngagementEvent {
  id:          string
  event_type:  string
  xp_earned:   number
  recorded_at: string
}

interface StreakRow {
  current_streak: number
  longest_streak: number
  last_event_date: string | null
}

const EVENT_LABELS: Record<string, string> = {
  block_completion:  'Completed a lesson',
  quiz_pass:         'Passed a quiz',
  discussion_post:   'Posted in discussion',
  daily_login:       'Daily check-in',
  course_completion: 'Completed a course',
  manual:            'Milestone awarded',
}

export default async function EngagementWidget({ uid }: { uid: string }) {
  const supabase = await createClient()

  const [streakRes, eventsRes, profileRes] = await Promise.all([
    supabase
      .from('engagement_streaks')
      .select('current_streak, longest_streak, last_event_date')
      .eq('user_id', uid)
      .maybeSingle(),
    supabase
      .from('engagement_events')
      .select('id, event_type, xp_earned, recorded_at')
      .eq('user_id', uid)
      .order('recorded_at', { ascending: false })
      .limit(5),
    supabase
      .from('profiles')
      .select('xp_points, current_level')
      .eq('uid', uid)
      .single(),
  ])

  const streak  = streakRes.data  as StreakRow | null
  const events  = (eventsRes.data ?? []) as EngagementEvent[]
  const profile = profileRes.data

  const xp            = profile?.xp_points    ?? 0
  const level         = profile?.current_level ?? 1
  const currentStreak = streak?.current_streak ?? 0
  const longestStreak = streak?.longest_streak ?? 0

  return (
    <section className="bg-white border border-border rounded-2xl p-5 mb-6 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">
        Formation Progress
      </h2>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="text-center">
          <p className="text-2xl font-extrabold text-foreground tabular-nums">
            {xp.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Total XP</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-extrabold text-foreground tabular-nums">
            {currentStreak > 0 ? `${currentStreak}🔥` : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Day streak</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-extrabold text-foreground tabular-nums">
            {level}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Level</p>
        </div>
      </div>

      {/* Recent activity */}
      {events.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            Recent Activity
          </p>
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center justify-between text-sm">
              <span className="text-foreground">
                {EVENT_LABELS[ev.event_type] ?? ev.event_type}
              </span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {ev.xp_earned > 0 && (
                  <span className="text-emerald-600 font-semibold">+{ev.xp_earned} XP</span>
                )}
                <span>
                  {new Date(ev.recorded_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          Complete a lesson to start tracking your progress.
        </p>
      )}

      {longestStreak > 1 && (
        <p className="text-xs text-muted-foreground mt-3">
          Longest streak: {longestStreak} days
        </p>
      )}
    </section>
  )
}
