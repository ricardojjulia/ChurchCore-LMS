'use client'

import { useState, useTransition } from 'react'
import { submitAssignment } from '@/app/actions/learning'

interface Props {
  blockId:       string
  instructions:  string
  maxPoints:     number
  existingSub?: {
    status:    string
    content:   { text?: string }
    score:     number | null
    max_score: number | null
    grade_pct: number | null
    feedback:  string | null
  } | null
}

export default function AssignmentPlayer({ blockId, instructions, maxPoints, existingSub }: Props) {
  const [body,    setBody]    = useState(existingSub?.content?.text ?? '')
  const [result,  setResult]  = useState<{ error?: string; done?: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  const alreadySubmitted = existingSub?.status === 'submitted'
  const isGraded         = existingSub?.status === 'graded'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    startTransition(async () => {
      const res = await submitAssignment(blockId, body, maxPoints)
      if (res.error) {
        setResult({ error: res.error })
      } else {
        setResult({ done: true })
      }
    })
  }

  if (result?.done || alreadySubmitted) {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <p className="text-sm font-semibold text-emerald-700">
          ✓ Submitted — awaiting instructor grade
        </p>
        {existingSub?.content?.text && (
          <div className="mt-3 text-sm text-slate-700 whitespace-pre-wrap bg-white border border-border rounded-lg p-4">
            {existingSub.content.text}
          </div>
        )}
      </div>
    )
  }

  if (isGraded && existingSub) {
    const pct = existingSub.grade_pct
    const color = pct === null ? 'slate' : pct >= 90 ? 'emerald' : pct >= 70 ? 'amber' : 'rose'
    return (
      <div className={`mt-6 rounded-xl border border-${color}-200 bg-${color}-50 px-5 py-4`}>
        <div className="flex items-center justify-between">
          <p className={`text-sm font-bold text-${color}-700`}>
            Grade: {existingSub.score ?? '?'} / {existingSub.max_score ?? maxPoints}
            {pct !== null && ` (${pct}%)`}
          </p>
        </div>
        {existingSub.feedback && (
          <p className="mt-2 text-sm text-slate-700 italic">{existingSub.feedback}</p>
        )}
        <div className="mt-3 text-sm text-slate-600 whitespace-pre-wrap bg-white border border-border rounded-lg p-4">
          {existingSub.content?.text}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="rounded-xl border border-border bg-white p-5">
        <label className="block text-sm font-semibold text-foreground mb-2">
          Your Response
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          placeholder="Write your response here…"
          className="w-full text-sm text-foreground bg-slate-50 border border-border rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition"
          required
          aria-label="Assignment response"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {body.length.toLocaleString()} characters · Max points: {maxPoints}
        </p>
      </div>

      {result?.error && (
        <p className="text-sm text-rose-600 font-medium" role="alert">{result.error}</p>
      )}

      <button
        type="submit"
        disabled={pending || !body.trim()}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {pending ? 'Submitting…' : 'Submit Assignment'}
      </button>
    </form>
  )
}
