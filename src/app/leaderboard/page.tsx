import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface LeaderEntry {
  uid:           string
  display_name:  string | null
  role:          string
  xp_points:     number
  current_level: number
}

const RANK_STYLES = [
  'text-yellow-500 font-black text-lg',  // 1st
  'text-slate-400 font-black text-lg',   // 2nd
  'text-amber-600 font-black text-lg',   // 3rd
]

const MEDALS = ['🥇', '🥈', '🥉']

const LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 4000, 8000, 15000, 30000]

function levelProgress(xp: number, level: number) {
  const lo = LEVEL_THRESHOLDS[level - 1] ?? 0
  const hi = LEVEL_THRESHOLDS[level]     ?? lo + 1000
  const pct = Math.min(100, Math.round(((xp - lo) / (hi - lo)) * 100))
  return { pct, remaining: hi - xp }
}

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('uid, xp_points, current_level')
    .eq('auth_id', user.id)
    .single()

  // Top 50 by XP — students only (staff don't earn XP)
  const { data: leaders } = await supabase
    .from('profiles')
    .select('uid, display_name, role, xp_points, current_level')
    .eq('role', 'student')
    .order('xp_points', { ascending: false })
    .order('current_level', { ascending: false })
    .limit(50)

  const rows = (leaders ?? []) as LeaderEntry[]
  const myRank = me ? rows.findIndex((r) => r.uid === me.uid) + 1 : 0

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Leaderboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Top students by XP earned</p>
        </div>

        {/* My rank card */}
        {me && me.xp_points > 0 && (
          <div className="bg-white border border-primary/30 rounded-2xl px-5 py-4 mb-6 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-base font-extrabold text-primary">
                {myRank > 0 ? `#${myRank}` : '—'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Your standing</p>
              <div className="flex items-center gap-3 mt-1">
                <div className="h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${levelProgress(me.xp_points, me.current_level).pct}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  Level {me.current_level} · {me.xp_points.toLocaleString()} XP
                </span>
              </div>
            </div>
            <Link
              href="/performance"
              className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors shrink-0"
            >
              My grades →
            </Link>
          </div>
        )}

        {/* Top 3 podium */}
        {rows.length >= 3 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[rows[1], rows[0], rows[2]].map((entry, i) => {
              const actualRank = i === 0 ? 2 : i === 1 ? 1 : 3
              if (!entry) return <div key={i} />
              return (
                <div
                  key={entry.uid}
                  className={`bg-white border rounded-2xl px-4 py-5 text-center ${
                    actualRank === 1
                      ? 'border-yellow-300 shadow-lg scale-105 origin-bottom'
                      : 'border-border'
                  }`}
                >
                  <p className="text-2xl mb-1">{MEDALS[actualRank - 1]}</p>
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-2">
                    <span className="text-sm font-extrabold text-indigo-700">
                      {(entry.display_name ?? '?')[0]?.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-foreground truncate">
                    {entry.display_name ?? 'Anonymous'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {entry.xp_points.toLocaleString()} XP
                  </p>
                  <p className="text-xs font-semibold text-primary mt-1">Lv {entry.current_level}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Full table */}
        {rows.length === 0 ? (
          <div className="bg-white border border-border rounded-xl p-10 text-center">
            <p className="text-muted-foreground italic">No students have earned XP yet.</p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <ul className="divide-y divide-border">
              {rows.map((entry, idx) => {
                const rank    = idx + 1
                const isMe    = entry.uid === me?.uid
                const { pct } = levelProgress(entry.xp_points, entry.current_level)

                return (
                  <li
                    key={entry.uid}
                    className={`flex items-center gap-4 px-5 py-3 ${isMe ? 'bg-primary/5' : 'hover:bg-slate-50/80'} transition-colors`}
                  >
                    <span className={`w-6 text-center shrink-0 ${RANK_STYLES[idx] ?? 'text-muted-foreground font-semibold text-sm'}`}>
                      {rank <= 3 ? MEDALS[rank - 1] : `${rank}`}
                    </span>

                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-extrabold text-indigo-700">
                        {(entry.display_name ?? '?')[0]?.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isMe ? 'text-primary' : 'text-foreground'}`}>
                        {entry.display_name ?? 'Anonymous'}{isMe ? ' (you)' : ''}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="h-1 w-20 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">Lv {entry.current_level}</span>
                      </div>
                    </div>

                    <span className="text-sm font-bold text-foreground shrink-0">
                      {entry.xp_points.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">XP</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </main>
  )
}
