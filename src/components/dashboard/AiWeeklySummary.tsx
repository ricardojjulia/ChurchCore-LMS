'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export default function AiWeeklySummary({ uid: _uid }: { uid: string }) {
  const t = useTranslations('dashboard.summary')
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
    } catch (_e) {
      setError('Could not generate summary. Try again later.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-indigo-900/60 bg-indigo-950/40 backdrop-blur-md px-5 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-base">✦</span>
          <p className="text-sm font-semibold text-indigo-300">{t('weeklyAiSummary')}</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-slate-400 hover:text-slate-200 text-xs leading-none mt-0.5 transition-colors"
          aria-label="Dismiss weekly AI summary"
        >
          ✕
        </button>
      </div>

      {summary ? (
        <p className="mt-2 text-sm text-slate-200 leading-relaxed">{summary}</p>
      ) : error ? (
        <p className="mt-2 text-sm text-rose-400">{error}</p>
      ) : (
        <button
          onClick={fetchSummary}
          disabled={loading}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 disabled:opacity-60 transition-colors"
          aria-label="Generate AI weekly progress summary"
        >
          {loading ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              {t('generating')}
            </>
          ) : (
            t('getMyWeeklySummary')
          )}
        </button>
      )}
    </div>
  )
}
