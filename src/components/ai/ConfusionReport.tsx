'use client'

import { useState } from 'react'

interface Stats {
  total:        number
  lowSimilarity: number
  zeroMatch:    number
  avgBestMatch?: number
}

interface ReportResult {
  analysis?:    string | null
  reason?:      string
  stats?:       Stats
  generatedAt?: string
  error?:       string
}

interface Props {
  sectionId:   string
  sectionCode: string
}

export default function ConfusionReport({ sectionId, sectionCode }: Props) {
  const [result,  setResult]  = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function generate() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/ai/confusion-topics', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sectionId }),
      })
      const data = await res.json() as ReportResult
      setResult(data)
    } catch {
      setResult({ error: 'Request failed. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-border rounded-2xl bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-slate-50">
        <div>
          <p className="text-sm font-bold text-foreground">Curriculum Gap Analysis</p>
          <p className="text-xs text-muted-foreground font-mono">{sectionCode}</p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="text-sm font-semibold bg-violet-600 text-white px-3 py-1.5 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Analysing…' : result ? 'Regenerate' : 'Generate Analysis'}
        </button>
      </div>

      {!result && !loading && (
        <p className="text-xs text-muted-foreground px-5 py-4">
          Uses query similarity statistics and a sample of indexed content to identify likely
          curriculum gaps — no student query text is stored or transmitted.
        </p>
      )}

      {loading && (
        <div className="px-5 py-6 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
          </span>
          Analysing query patterns and content coverage…
        </div>
      )}

      {result && (
        <div className="px-5 py-4 space-y-4">
          {result.error && (
            <p className="text-sm text-rose-600">{result.error}</p>
          )}

          {result.reason && !result.analysis && (
            <p className="text-sm text-muted-foreground italic">{result.reason}</p>
          )}

          {result.stats && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span><strong className="text-foreground">{result.stats.total}</strong> queries</span>
              <span>
                <strong className={result.stats.lowSimilarity > 0 ? 'text-amber-600' : 'text-foreground'}>
                  {result.stats.lowSimilarity}
                </strong> low-match
              </span>
              <span>
                <strong className={result.stats.zeroMatch > 0 ? 'text-rose-600' : 'text-foreground'}>
                  {result.stats.zeroMatch}
                </strong> zero-match
              </span>
              {result.stats.avgBestMatch !== undefined && (
                <span>avg match <strong className="text-foreground">
                  {Math.round(result.stats.avgBestMatch * 100)}%
                </strong></span>
              )}
            </div>
          )}

          {result.analysis && (
            <div className="prose prose-sm max-w-none text-foreground">
              {result.analysis.split('\n').map((line, i) => {
                const trimmed = line.trim()
                if (!trimmed) return <br key={i} />
                // Render numbered list items as styled lines
                if (/^\d+\./.test(trimmed)) {
                  return (
                    <p key={i} className="text-sm font-semibold text-foreground mt-2 mb-0.5">
                      {trimmed}
                    </p>
                  )
                }
                return <p key={i} className="text-sm text-foreground my-0.5">{trimmed}</p>
              })}
            </div>
          )}

          {result.generatedAt && (
            <p className="text-[10px] text-muted-foreground">
              Generated {new Date(result.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
