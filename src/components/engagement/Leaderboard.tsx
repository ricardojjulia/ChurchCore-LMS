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
      className="w-8 h-8 rounded-lg bg-indigo-950 text-amber-300 border border-indigo-800/70 text-xs font-bold flex items-center justify-center uppercase shrink-0 font-display"
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
        'flex items-center gap-3 px-4 py-3 border-b border-slate-800/70 last:border-b-0 transition-colors',
        entry.is_current_user
          ? 'bg-indigo-950/40 border-l-2 border-l-amber-400'
          : 'border-l-2 border-l-transparent hover:bg-slate-900/40'
      )}
      aria-current={entry.is_current_user ? 'true' : undefined}
    >
      <span className="w-8 text-center text-sm font-bold text-slate-400 shrink-0">
        {medal ?? `#${entry.rank}`}
      </span>
      <Initials name={entry.display_name} />
      <span
        className={cn(
          'flex-1 text-sm font-semibold truncate',
          entry.is_current_user ? 'text-amber-300' : 'text-slate-100'
        )}
      >
        {entry.display_name}
        {entry.is_current_user && (
          <span className="ml-1.5 text-xs font-normal text-amber-400/80">(you)</span>
        )}
      </span>
      <span className="text-xs text-slate-400 shrink-0 tabular-nums">
        Lv {entry.current_level}
      </span>
      <span className="text-sm font-bold text-amber-300 shrink-0 tabular-nums w-24 text-right">
        {entry.xp_points.toLocaleString()} XP
      </span>
    </div>
  )
}

export default async function Leaderboard({ className = 'mb-8' }: { className?: string } = {}) {
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
    <section className={className} aria-label="Community Leaderboard">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display font-bold text-white">🏆 Community Leaderboard</h2>
        {currentUserRank === 1 && (
          <span className="text-xs font-bold text-amber-300 bg-amber-950/70 border border-amber-800/70 px-2.5 py-1 rounded-full">
            You&apos;re #1!
          </span>
        )}
      </div>

      <div className="card-crisp overflow-hidden">
        {topEntries.map((entry) => (
          <LeaderboardRow key={entry.uid} entry={entry} />
        ))}

        {currentUserRow && (
          <>
            <div className="px-4 py-2 text-xs text-center text-slate-400 bg-slate-950/40 border-t border-slate-800/80 select-none">
              · · ·
            </div>
            <LeaderboardRow entry={currentUserRow} />
          </>
        )}
      </div>
    </section>
  )
}
