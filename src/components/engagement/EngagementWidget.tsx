import { getTranslations } from 'next-intl/server'
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

export default async function EngagementWidget({
  uid,
  action,
  children,
}: {
  uid: string
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  const t = await getTranslations('dashboard.summary')
  const supabase = await createClient()

  const EVENT_LABELS: Record<string, string> = {
    block_completion:  'Completed a lesson',
    quiz_pass:         'Passed a quiz',
    discussion_post:   'Posted in discussion',
    daily_login:       'Daily check-in',
    course_completion: 'Completed a course',
    manual:            'Milestone awarded',
  }

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
    <section className="card-crisp p-5 mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
          {t('formationProgress')}
        </h2>
        {action ?? children}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="text-center p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <p className="text-2xl font-extrabold text-amber-300 tabular-nums">
            {xp.toLocaleString()}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">{t('totalXp')}</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <p className="text-2xl font-extrabold text-slate-100 tabular-nums">
            {currentStreak > 0 ? `${currentStreak}🔥` : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">{t('dayStreak')}</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <p className="text-2xl font-extrabold text-indigo-300 tabular-nums">
            {level}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">{t('level')}</p>
        </div>
      </div>

      {/* Recent activity */}
      {events.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono">
            {t('recentActivity')}
          </p>
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-800/50 last:border-0">
              <span className="text-slate-200">
                {EVENT_LABELS[ev.event_type] ?? ev.event_type}
              </span>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {ev.xp_earned > 0 && (
                  <span className="text-emerald-400 font-semibold">+{ev.xp_earned} XP</span>
                )}
                <span className="text-slate-500">
                  {new Date(ev.recorded_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic">
          {t('completeLessonHint')}
        </p>
      )}

      {longestStreak > 1 && (
        <p className="text-xs text-slate-400 mt-3">
          {t('longestStreak', { days: longestStreak })}
        </p>
      )}
    </section>
  )
}
