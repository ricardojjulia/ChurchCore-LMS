'use client'

import { useState, useCallback, useTransition } from 'react'
import { updateFeedbackTriage, markFeedbackProcessed, TriageAction } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedbackRow {
  id:                       string
  session_id:               string
  route:                    string
  category:                 'BUG' | 'ERROR' | 'UNEXPECTED_RESULT' | 'IMPROVEMENT'
  error_message:            string | null
  note:                     string | null
  breadcrumbs:              string[]
  user_email:               string | null
  user_role:                string | null
  app_version:              string | null
  session_duration_seconds: number | null
  hit_count:                number
  metadata:                 Record<string, unknown>
  processed:                boolean
  triage_action:            TriageAction | null
  created_at:               string
  updated_at:               string
}

interface Props {
  rows: FeedbackRow[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<FeedbackRow['category'], string> = {
  BUG:               'Bug',
  ERROR:             'Error',
  UNEXPECTED_RESULT: 'Unexpected',
  IMPROVEMENT:       'Improvement',
}

const CATEGORY_COLORS: Record<FeedbackRow['category'], string> = {
  BUG:               'bg-red-900 text-red-300',
  ERROR:             'bg-rose-900 text-rose-300',
  UNEXPECTED_RESULT: 'bg-amber-900 text-amber-300',
  IMPROVEMENT:       'bg-sky-900 text-sky-300',
}

const TRIAGE_OPTIONS: { value: TriageAction; label: string }[] = [
  { value: 'fixed',             label: 'Fixed' },
  { value: 'no_action_needed',  label: 'No action needed' },
  { value: 'acknowledged',      label: 'Acknowledged' },
  { value: 'implemented',       label: 'Implemented' },
  { value: 'received_closed',   label: 'Received / Closed' },
]

function CategoryBadge({ category }: { category: FeedbackRow['category'] }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  )
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FeedbackTable({ rows: initialRows }: Props) {
  // Local optimistic state — mirrors server rows but allows instant UI updates.
  const [rows, setRows]         = useState<FeedbackRow[]>(initialRows)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [, startTransition]     = useTransition()

  // ── Client-side filter state ───────────────────────────────────────────────
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterIdentity, setFilterIdentity] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo,   setFilterDateTo]   = useState<string>('')

  // Apply filters to current rows list.
  const filtered = rows.filter(r => {
    if (filterCategory && r.category !== filterCategory) return false
    if (filterIdentity) {
      const q = filterIdentity.toLowerCase()
      if (
        !r.user_email?.toLowerCase().includes(q) &&
        !r.user_role?.toLowerCase().includes(q)
      ) return false
    }
    if (filterDateFrom && r.created_at < filterDateFrom) return false
    if (filterDateTo   && r.created_at > filterDateTo + 'T23:59:59') return false
    return true
  })

  const selectedRow = filtered.find(r => r.id === selectedId) ?? null

  // ── Optimistic update helpers ──────────────────────────────────────────────

  function optimisticUpdate(id: string, patch: Partial<FeedbackRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  function rollback(id: string, original: FeedbackRow) {
    setRows(prev => prev.map(r => r.id === id ? original : r))
  }

  const handleTriageChange = useCallback(
    (id: string, value: string) => {
      const row = rows.find(r => r.id === id)
      if (!row) return
      const action = (value === '' ? null : value) as TriageAction | null
      optimisticUpdate(id, { triage_action: action })
      startTransition(async () => {
        const result = await updateFeedbackTriage(id, action)
        if (result.error) rollback(id, row)
      })
    },
    [rows],
  )

  const handleProcessedToggle = useCallback(
    (id: string, processed: boolean) => {
      const row = rows.find(r => r.id === id)
      if (!row) return
      optimisticUpdate(id, { processed })
      startTransition(async () => {
        const result = await markFeedbackProcessed(id, processed)
        if (result.error) rollback(id, row)
      })
    },
    [rows],
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-6">
      {/* Left: filter + table */}
      <div className="min-w-0 flex-1">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            aria-label="Filter by category"
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          <input
            type="text"
            value={filterIdentity}
            onChange={e => setFilterIdentity(e.target.value)}
            placeholder="Email or role…"
            aria-label="Filter by identity"
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />

          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            aria-label="From date"
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            aria-label="To date"
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                {['Time', 'Identity', 'Route', 'Category', 'Preview', 'Hits', 'Action', 'Done'].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-600">
                    No feedback entries match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map(row => (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  aria-expanded={selectedId === row.id}
                  aria-label={`View details for feedback from ${row.user_email ?? 'anonymous session'} on ${row.route}`}
                  className={`cursor-pointer transition-colors hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 ${selectedId === row.id ? 'bg-slate-900' : ''}`}
                  onClick={() => setSelectedId(selectedId === row.id ? null : row.id)}
                  onKeyDown={e => {
                    // Only react when the row itself is focused, not a nested
                    // control (select/checkbox) that already handles its own keys.
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedId(selectedId === row.id ? null : row.id)
                    }
                  }}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[140px] truncate text-xs text-slate-300">
                      {row.user_email ?? '—'}
                    </p>
                    {row.user_role && (
                      <p className="text-xs text-slate-600">{row.user_role}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[140px] truncate text-xs text-slate-400">{row.route}</p>
                  </td>
                  <td className="px-4 py-3">
                    <CategoryBadge category={row.category} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[200px] truncate text-xs text-slate-400">
                      {(row.category === 'ERROR' ? row.error_message : row.note) ?? '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-semibold text-slate-300">
                    {row.hit_count}
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <select
                      value={row.triage_action ?? ''}
                      onChange={e => handleTriageChange(row.id, e.target.value)}
                      aria-label="Triage action"
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">— Pending —</option>
                      {TRIAGE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={row.processed}
                      onChange={e => handleProcessedToggle(row.id, e.target.checked)}
                      aria-label="Mark as processed"
                      className="h-4 w-4 rounded border-slate-600 accent-indigo-600"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: detail drawer */}
      {selectedRow && (
        <aside className="w-80 shrink-0 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm">
          <div className="flex items-center justify-between">
            <CategoryBadge category={selectedRow.category} />
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Close detail drawer"
              className="rounded p-1 text-slate-500 hover:text-slate-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>

          <dl className="mt-4 space-y-3 text-xs">
            <div>
              <dt className="font-semibold text-slate-400">Route</dt>
              <dd className="mt-0.5 break-all text-slate-200">{selectedRow.route}</dd>
            </div>
            {selectedRow.user_email && (
              <div>
                <dt className="font-semibold text-slate-400">User</dt>
                <dd className="mt-0.5 text-slate-200">
                  {selectedRow.user_email}
                  {selectedRow.user_role && <span className="ml-1 text-slate-500">({selectedRow.user_role})</span>}
                </dd>
              </div>
            )}
            <div>
              <dt className="font-semibold text-slate-400">Hit count</dt>
              <dd className="mt-0.5 text-slate-200">{selectedRow.hit_count}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-400">Session duration</dt>
              <dd className="mt-0.5 text-slate-200">{formatDuration(selectedRow.session_duration_seconds)}</dd>
            </div>
            {selectedRow.app_version && (
              <div>
                <dt className="font-semibold text-slate-400">App version</dt>
                <dd className="mt-0.5 text-slate-200">{selectedRow.app_version}</dd>
              </div>
            )}
            <div>
              <dt className="font-semibold text-slate-400">
                {selectedRow.category === 'ERROR' ? 'Error message' : 'Note'}
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-slate-200">
                {(selectedRow.category === 'ERROR' ? selectedRow.error_message : selectedRow.note) || <span className="text-slate-600">None</span>}
              </dd>
            </div>
            {selectedRow.breadcrumbs.length > 0 && (
              <div>
                <dt className="font-semibold text-slate-400">Breadcrumbs</dt>
                <dd className="mt-0.5">
                  <ol className="space-y-0.5">
                    {selectedRow.breadcrumbs.map((b, i) => (
                      <li key={i} className="truncate text-slate-400">
                        <span className="mr-1 text-slate-600">{i + 1}.</span>{b}
                      </li>
                    ))}
                  </ol>
                </dd>
              </div>
            )}
            <div>
              <dt className="font-semibold text-slate-400 mb-1">Triage action</dt>
              <dd>
                <select
                  value={selectedRow.triage_action ?? ''}
                  onChange={e => handleTriageChange(selectedRow.id, e.target.value)}
                  aria-label="Triage action"
                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">— Pending —</option>
                  {TRIAGE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`processed-drawer-${selectedRow.id}`}
                checked={selectedRow.processed}
                onChange={e => handleProcessedToggle(selectedRow.id, e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 accent-indigo-600"
              />
              <label htmlFor={`processed-drawer-${selectedRow.id}`} className="text-slate-300">
                Mark as processed
              </label>
            </div>
          </dl>

          {/* Collapsed raw-JSON view */}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-slate-600 hover:text-slate-400">
              Raw JSON
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-500">
              {JSON.stringify(selectedRow, null, 2)}
            </pre>
          </details>
        </aside>
      )}
    </div>
  )
}
