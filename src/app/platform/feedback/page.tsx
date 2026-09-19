import { createServiceClient } from '@/utils/supabase/service'
import { FeedbackTable, FeedbackRow } from './FeedbackTable'

// The layout (src/app/platform/layout.tsx) already verifies the user is a
// platform admin and redirects otherwise — mirroring the pattern used by every
// other page under src/app/platform/.

interface SearchParams {
  view?:     string
  category?: string
  q?:        string
  from?:     string
  to?:       string
}

export const metadata = { title: 'Feedback Triage — Platform Admin' }

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params   = await searchParams
  const view     = params.view ?? 'open'
  const category = params.category ?? ''

  const service = createServiceClient()

  let query = service
    .from('platform_feedback')
    .select(
      'id, session_id, route, category, error_message, note, breadcrumbs, ' +
      'user_email, user_role, app_version, session_duration_seconds, hit_count, ' +
      'metadata, processed, triage_action, created_at, updated_at'
    )

  // View filter
  if (view === 'open') {
    query = query.eq('processed', false)
  } else if (view === 'done') {
    query = query.eq('processed', true)
  }
  // 'all' → no processed filter

  // Category filter (server-side pre-filter; FeedbackTable also does client-side)
  if (category && ['BUG', 'ERROR', 'UNEXPECTED_RESULT', 'IMPROVEMENT'].includes(category)) {
    query = query.eq('category', category)
  }

  // Sort: unprocessed first, then newest within each bucket
  const { data } = await query
    .order('processed', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as FeedbackRow[]

  const openCount = rows.filter(r => !r.processed).length
  const doneCount = rows.filter(r =>  r.processed).length

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Feedback Triage</h1>
        <p className="text-xs text-slate-500">
          {openCount} open · {doneCount} done
        </p>
      </div>

      {/* View tabs */}
      <div className="mt-6 flex gap-1">
        {[
          { key: 'open', label: 'Open' },
          { key: 'done', label: 'Done' },
          { key: 'all',  label: 'All' },
        ].map(({ key, label }) => (
          <a
            key={key}
            href={`/platform/feedback?view=${key}${category ? `&category=${category}` : ''}`}
            className={[
              'rounded px-3 py-1.5 text-sm transition-colors',
              view === key
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white',
            ].join(' ')}
            aria-current={view === key ? 'page' : undefined}
          >
            {label}
          </a>
        ))}
      </div>

      {/* Feedback table + drawer */}
      <div className="mt-6">
        {rows.length === 0 ? (
          <div className="rounded-md border border-slate-800 bg-slate-950 py-16 text-center text-slate-600">
            No feedback entries in this view.
          </div>
        ) : (
          <FeedbackTable rows={rows} />
        )}
      </div>
    </>
  )
}
