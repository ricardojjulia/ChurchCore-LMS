'use client'

import { useState, useTransition } from 'react'
import { gradeSubmission } from '@/app/actions/learning'

interface Props {
  submissionId: string
  maxScore:     number | null
  currentScore: number | null
  feedback:     string | null
  onDone:       () => void
}

export default function GradeForm({ submissionId, maxScore, currentScore, feedback, onDone }: Props) {
  const [score,    setScore]    = useState(currentScore ?? '')
  const [fb,       setFb]       = useState(feedback ?? '')
  const [error,    setError]    = useState<string | null>(null)
  const [pending,  startTx]     = useTransition()

  const max = maxScore ?? 100

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const s = Number(score)
    if (isNaN(s) || s < 0 || s > max) {
      setError(`Score must be between 0 and ${max}`)
      return
    }
    setError(null)
    startTx(async () => {
      const res = await gradeSubmission(submissionId, s, fb)
      if (res.error) {
        setError(res.error)
      } else {
        onDone()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 border-t border-border pt-3">
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-foreground whitespace-nowrap" htmlFor={`score-${submissionId}`}>
          Score (max {max})
        </label>
        <input
          id={`score-${submissionId}`}
          type="number"
          min={0}
          max={max}
          step={0.5}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="w-24 text-sm border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          required
          aria-label={`Score out of ${max}`}
        />
        {score !== '' && (
          <span className="text-xs text-muted-foreground">
            = {Math.round((Number(score) / max) * 100)}%
          </span>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-foreground block mb-1" htmlFor={`fb-${submissionId}`}>
          Feedback (optional)
        </label>
        <textarea
          id={`fb-${submissionId}`}
          value={fb}
          onChange={(e) => setFb(e.target.value)}
          rows={3}
          placeholder="Write feedback for the student…"
          className="w-full text-sm border border-border rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="Grade feedback"
        />
      </div>

      {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-semibold bg-primary text-primary-foreground px-4 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {pending ? 'Saving…' : 'Post Grade'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
