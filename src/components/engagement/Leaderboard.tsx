import { createClient } from '@/utils/supabase/server'
import { cn } from '@/lib/utils'

type LeaderboardEntry = {
  rank:            number
  uid:             string
  display_name:    string
  xp_points:       number
  current_level:   number
  is_current_user: boolean
}

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function Initials({ name }: { name: string }) {
  const parts    = name.trim().split(/\s+/)
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : name.slice(0, 2)
  return (
    <span
      aria-hidden="true"
      className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center uppercase shrink-0"
    >
      {initials.toUpperCase()}
    </span>
  )
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const medal = RANK_MEDAL[entry.rank]
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0',
        entry.is_current_user
          ? 'bg-primary/5 border-l-2 border-l-primary'
          : 'border-l-2 border-l-transparent'
      )}
      aria-current={entry.is_current_user ? 'true' : undefined}
    >
      <span className="w-8 text-center text-sm font-bold text-muted-foreground shrink-0">
        {medal ?? `#${entry.rank}`}
      </span>
      <Initials name={entry.display_name} />
      <span
        className={cn(
          'flex-1 text-sm font-semibold truncate',
          entry.is_current_user ? 'text-primary' : 'text-foreground'
        )}
      >
        {entry.display_name}
        {entry.is_current_user && (
          <span className="ml-1.5 text-xs font-normal text-primary/70">(you)</span>
        )}
      </span>
      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
        Lv {entry.current_level}
      </span>
      <span className="text-sm font-bold text-foreground shrink-0 tabular-nums w-20 text-right">
        {entry.xp_points.toLocaleString()} XP
      </span>
    </div>
  )
}

export default async function Leaderboard() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: 10 })

  if (error || !data?.length) return null

  const entries = data as LeaderboardEntry[]

  // Current user outside top N → the RPC appends their row at the end as the only
  // is_current_user=true entry not present in the preceding rows.
  const lastEntry              = entries.at(-1)
  const hasCurrentUserSeparate =
    lastEntry?.is_current_user === true &&
    !entries.slice(0, -1).some((e) => e.is_current_user)
  const topEntries     = hasCurrentUserSeparate ? entries.slice(0, -1) : entries
  const currentUserRow = hasCurrentUserSeparate ? lastEntry : undefined

  const currentUserRank = entries.find((e) => e.is_current_user)?.rank

  return (
    <section className="mb-8" aria-label="Community Leaderboard">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground">🏆 Community Leaderboard</h2>
        {currentUserRank === 1 && (
          <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            You&apos;re #1!
          </span>
        )}
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        {topEntries.map((entry) => (
          <LeaderboardRow key={entry.uid} entry={entry} />
        ))}

        {currentUserRow && (
          <>
            <div className="px-4 py-2 text-xs text-center text-muted-foreground bg-slate-50 border-t border-border select-none">
              · · ·
            </div>
            <LeaderboardRow entry={currentUserRow} />
          </>
        )}
      </div>
    </section>
  )
}
