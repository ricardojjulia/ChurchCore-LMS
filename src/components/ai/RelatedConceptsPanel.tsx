'use client'

import { useState } from 'react'

type EmbeddingStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'stale' | null

interface RelatedConceptItem {
  chunkId:        string
  sourceType:     string
  sourceId:       string
  chunkText:      string
  similarity:     number
  sectionId:      string
  sectionCode:    string
  blueprintTitle: string
}

interface Props {
  pageId:          string
  embeddingStatus: EmbeddingStatus
}

export default function RelatedConceptsPanel({ pageId, embeddingStatus }: Props) {
  const [results, setResults] = useState<RelatedConceptItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [reason,  setReason]  = useState<string | null>(null)

  const isIndexed = embeddingStatus === 'complete'

  async function findRelated() {
    setLoading(true)
    setError(null)
    setReason(null)
    try {
      const res = await fetch('/api/ai/related-concepts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pageId }),
      })
      const data = await res.json() as { results?: RelatedConceptItem[]; reason?: string; error?: string }
      if (!res.ok || data.error) { setError(data.error ?? 'Request failed.'); return }
      setResults(data.results ?? [])
      if (data.reason) setReason(data.reason)
    } catch {
      setError('Request failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t border-border pt-8 pb-12">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-foreground">Related Content</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Semantically similar pages across all sections — for cross-referencing and curriculum alignment.
          </p>
        </div>

        {isIndexed ? (
          <button
            type="button"
            onClick={findRelated}
            disabled={loading}
            className="text-sm font-semibold bg-violet-600 text-white px-3 py-1.5 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors shrink-0"
          >
            {loading ? 'Searching…' : results !== null ? 'Refresh' : 'Find Related'}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground italic shrink-0">
            {embeddingStatus === 'pending' || embeddingStatus === 'processing'
              ? 'Content is being indexed…'
              : embeddingStatus === 'failed'
                ? 'Indexing failed — re-publish to retry.'
                : 'Publish this page to enable related content search.'}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground py-3">
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
          </span>
          Searching across indexed content…
        </div>
      )}

      {error && <p className="text-sm text-rose-600 py-2">{error}</p>}

      {!loading && reason && (results === null || results.length === 0) && (
        <p className="text-sm text-muted-foreground italic py-2">{reason}</p>
      )}

      {!loading && results !== null && results.length === 0 && !reason && (
        <p className="text-sm text-muted-foreground italic py-2">
          No semantically similar pages found in other sections.
        </p>
      )}

      {results !== null && results.length > 0 && (
        <div className="space-y-3">
          {results.map((item) => (
            <div
              key={item.chunkId}
              className="border border-border rounded-xl px-4 py-3 bg-slate-50 hover:bg-white transition-colors"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded shrink-0">
                    {item.sectionCode}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">{item.blueprintTitle}</span>
                </div>
                <span className={`text-xs font-semibold shrink-0 ${
                  item.similarity >= 0.90
                    ? 'text-emerald-700'
                    : item.similarity >= 0.80
                      ? 'text-violet-700'
                      : 'text-amber-600'
                }`}>
                  {Math.round(item.similarity * 100)}% match
                </span>
              </div>
              <p className="text-sm text-foreground line-clamp-3 leading-relaxed">
                {item.chunkText}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
