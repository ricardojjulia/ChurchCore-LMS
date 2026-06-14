'use client'

import { useState } from 'react'

export default function AiWeeklySummary({ uid }: { uid: string }) {
  const [summary,   setSummary]   = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  async function fetchSummary() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/ai/weekly-summary')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setSummary(json.summary)
    } catch (e) {
      setError('Could not generate summary. Try again later.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-indigo-500 text-base">✦</span>
          <p className="text-sm font-semibold text-indigo-800">Weekly AI Summary</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-indigo-400 hover:text-indigo-600 text-xs leading-none mt-0.5 transition-colors"
          aria-label="Dismiss weekly AI summary"
        >
          ✕
        </button>
      </div>

      {summary ? (
        <p className="mt-2 text-sm text-indigo-900 leading-relaxed">{summary}</p>
      ) : error ? (
        <p className="mt-2 text-sm text-rose-600">{error}</p>
      ) : (
        <button
          onClick={fetchSummary}
          disabled={loading}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 disabled:opacity-60 transition-colors"
          aria-label="Generate AI weekly progress summary"
        >
          {loading ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              Generating…
            </>
          ) : (
            'Get my weekly progress summary →'
          )}
        </button>
      )}
    </div>
  )
}
