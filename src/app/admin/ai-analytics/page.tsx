import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import ConfusionReport from '@/components/ai/ConfusionReport'

export const dynamic = 'force-dynamic'

const DAYS = 30

export default async function AiAnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()
  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString()

  // ── Fetch all log entries in the window ───────────────────
  const { data: logs } = await supabase
    .from('ai_query_log')
    .select('section_id, context_version, chunk_count, similarity_max, responded_at, user_id')
    .gte('responded_at', since)
    .order('responded_at', { ascending: false })

  const entries = logs ?? []

  // ── Aggregate: queries per day ────────────────────────────
  const byDay: Record<string, number> = {}
  for (const e of entries) {
    const day = e.responded_at.slice(0, 10)
    byDay[day] = (byDay[day] ?? 0) + 1
  }
  const dailySeries = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  // ── Aggregate: queries per section ────────────────────────
  const bySectionId: Record<string, number> = {}
  for (const e of entries) {
    bySectionId[e.section_id] = (bySectionId[e.section_id] ?? 0) + 1
  }
  const topSectionIds = Object.entries(bySectionId)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id]) => id)

  // Fetch section names for top sections
  const { data: sections } = topSectionIds.length > 0
    ? await supabase
        .from('course_sections')
        .select('id, section_code, course_blueprints ( title )')
        .in('id', topSectionIds)
    : { data: [] }

  const sectionNameMap: Record<string, string> = {}
  const sectionCodeMap: Record<string, string> = {}
  for (const s of sections ?? []) {
    const bp = s.course_blueprints as unknown as { title: string } | null
    sectionNameMap[s.id] = bp ? `${bp.title} (${s.section_code})` : s.section_code
    sectionCodeMap[s.id] = s.section_code
  }

  const topSections = Object.entries(bySectionId)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, count]) => ({ id, count, label: sectionNameMap[id] ?? id }))

  // ── Aggregate: queries per cohort ─────────────────────────
  // Join ai_query_log.user_id → cohort_members → global_cohorts
  const userIds = [...new Set(entries.map((e) => e.user_id))]
  const { data: memberships } = userIds.length > 0
    ? await supabase
        .from('cohort_members')
        .select('user_id, global_cohorts ( cohort_name, cohort_code )')
        .in('user_id', userIds)
        .eq('status', 'active')
    : { data: [] }

  // user_id → cohort_name (one user may be in multiple cohorts; pick first)
  const userCohortMap: Record<string, string> = {}
  for (const m of memberships ?? []) {
    if (userCohortMap[m.user_id]) continue
    const gc = m.global_cohorts as unknown as { cohort_name: string; cohort_code: string } | null
    if (gc) userCohortMap[m.user_id] = gc.cohort_name
  }

  const byCohort: Record<string, number> = {}
  let noCohortCount = 0
  for (const e of entries) {
    const cohort = userCohortMap[e.user_id]
    if (cohort) byCohort[cohort] = (byCohort[cohort] ?? 0) + 1
    else noCohortCount++
  }
  const cohortRows = Object.entries(byCohort)
    .sort(([, a], [, b]) => b - a)

  // ── Aggregate: context versions ────────────────────────────
  const byVersion: Record<string, number> = {}
  for (const e of entries) {
    byVersion[e.context_version] = (byVersion[e.context_version] ?? 0) + 1
  }

  // ── Aggregate: low-similarity sections (potential content gaps) ──
  const sectionSimilarity: Record<string, number[]> = {}
  for (const e of entries) {
    if (e.similarity_max !== null) {
      sectionSimilarity[e.section_id] = sectionSimilarity[e.section_id] ?? []
      sectionSimilarity[e.section_id].push(e.similarity_max)
    }
  }
  const lowSimilaritySections = Object.entries(sectionSimilarity)
    .map(([id, scores]) => ({
      id,
      label:   sectionNameMap[id] ?? id,
      avgMax:  scores.reduce((s, v) => s + v, 0) / scores.length,
      queries: scores.length,
    }))
    .filter((s) => s.avgMax < 0.80 && s.queries >= 3)
    .sort((a, b) => a.avgMax - b.avgMax)
    .slice(0, 5)

  // ── Bar scale helper ──────────────────────────────────────
  const maxDaily  = Math.max(...dailySeries.map((d) => d.count), 1)
  const maxSection = Math.max(...topSections.map((s) => s.count), 1)
  const maxCohort  = Math.max(...cohortRows.map(([, c]) => c), 1)

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">AI Tutor Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">Last {DAYS} days · Queries are hashed — no student content stored</p>
          </div>
          <Link href="/admin/sections" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            ← Sections
          </Link>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Queries',     value: entries.length },
            { label: 'Unique Sections',   value: Object.keys(bySectionId).length },
            { label: 'Unique Learners',   value: new Set(entries.map((e) => e.user_id)).size },
            { label: 'Avg Chunks / Query',value: entries.length
                ? (entries.reduce((s, e) => s + (e.chunk_count ?? 0), 0) / entries.length).toFixed(1)
                : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-border rounded-2xl px-5 py-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-extrabold text-foreground mt-1">{value}</p>
            </div>
          ))}
        </div>

        {entries.length === 0 && (
          <div className="bg-white border border-border rounded-2xl p-12 text-center shadow-sm">
            <p className="text-muted-foreground">No AI tutor queries in the last {DAYS} days.</p>
            <p className="text-xs text-muted-foreground mt-2">
              Queries appear here once students start using the tutor in indexed sections.
            </p>
          </div>
        )}

        {entries.length > 0 && (
          <>
            {/* Queries per day */}
            <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
              <h2 className="font-bold text-foreground mb-4">Queries per Day</h2>
              <div className="flex items-end gap-1 h-24 overflow-x-auto pb-2">
                {dailySeries.map(({ date, count }) => (
                  <div key={date} className="flex flex-col items-center gap-1 shrink-0" style={{ width: 24 }}>
                    <div
                      className="w-4 bg-violet-400 rounded-t"
                      style={{ height: `${Math.max(2, Math.round((count / maxDaily) * 80))}px` }}
                      title={`${date}: ${count}`}
                    />
                    <span className="text-[8px] text-muted-foreground -rotate-45 origin-top-left translate-y-2">
                      {date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Top sections */}
              <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
                <h2 className="font-bold text-foreground mb-4">Top Sections by Query Volume</h2>
                <div className="space-y-2.5">
                  {topSections.map(({ id, label, count }) => (
                    <div key={id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate text-foreground">{label}</p>
                      </div>
                      <div className="w-24 bg-slate-100 rounded h-2 shrink-0">
                        <div
                          className="bg-violet-500 h-2 rounded"
                          style={{ width: `${Math.round((count / maxSection) * 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-foreground w-8 text-right shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Queries by cohort */}
              <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
                <h2 className="font-bold text-foreground mb-4">Queries by Cohort</h2>
                {cohortRows.length === 0 && noCohortCount === entries.length ? (
                  <p className="text-sm text-muted-foreground italic">No cohort assignments found for querying users.</p>
                ) : (
                  <div className="space-y-2.5">
                    {cohortRows.map(([name, count]) => (
                      <div key={name} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate text-foreground">{name}</p>
                        </div>
                        <div className="w-24 bg-slate-100 rounded h-2 shrink-0">
                          <div
                            className="bg-emerald-500 h-2 rounded"
                            style={{ width: `${Math.round((count / maxCohort) * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-foreground w-8 text-right shrink-0">{count}</span>
                      </div>
                    ))}
                    {noCohortCount > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate text-muted-foreground italic">No cohort</p>
                        </div>
                        <div className="w-24 bg-slate-100 rounded h-2 shrink-0">
                          <div
                            className="bg-slate-300 h-2 rounded"
                            style={{ width: `${Math.round((noCohortCount / maxCohort) * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-muted-foreground w-8 text-right shrink-0">{noCohortCount}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Context versions */}
              <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
                <h2 className="font-bold text-foreground mb-1">Context Versions in Use</h2>
                <p className="text-xs text-muted-foreground mb-4">A version change indicates a prompt update. See ADR-2025-003 amendment log.</p>
                <div className="space-y-1">
                  {Object.entries(byVersion)
                    .sort(([, a], [, b]) => b - a)
                    .map(([version, count]) => (
                      <div key={version} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-foreground">{version}</span>
                        <span className="text-muted-foreground">{count} queries ({Math.round((count / entries.length) * 100)}%)</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Content gap signals */}
              <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
                <h2 className="font-bold text-foreground mb-1">Low Similarity Sections</h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Sections where avg best-match similarity is below 80% — students may be asking questions the content doesn't cover.
                </p>
                {lowSimilaritySections.length === 0 ? (
                  <p className="text-sm text-emerald-700">No sections with persistent low similarity. Content coverage looks good.</p>
                ) : (
                  <div className="space-y-2">
                    {lowSimilaritySections.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-sm">
                        <span className="truncate text-foreground flex-1 mr-4">{s.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-amber-600 font-semibold">{Math.round(s.avgMax * 100)}% avg</span>
                          <span className="text-muted-foreground text-xs">({s.queries} queries)</span>
                          <Link
                            href={`/courses/${s.id}/pages`}
                            className="text-primary text-xs hover:underline"
                          >
                            Pages →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Curriculum Gap Analysis — one panel per section with query data */}
            {topSections.length > 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-bold text-foreground">Curriculum Gap Analysis</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    AI-generated gap analysis for your most-queried sections. No student query text is stored or used — analysis is based on content coverage and similarity statistics only.
                  </p>
                </div>
                {topSections.slice(0, 5).map((s) => {
                  const code = sectionCodeMap[s.id] ?? s.id.slice(0, 8)
                  return (
                    <ConfusionReport
                      key={s.id}
                      sectionId={s.id}
                      sectionCode={code}
                    />
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
