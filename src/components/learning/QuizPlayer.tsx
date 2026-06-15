'use client'

import { useState, useTransition } from 'react'
import { submitQuiz } from '@/app/actions/learning'
import type { QuizQuestion } from '@/types/blocks'
import { cn } from '@/lib/utils'

interface Props {
  blockId:      string
  questions:    QuizQuestion[]
  blockXp?:     number
  existingSub?: {
    status:    string
    grade_pct: number | null
    score:     number | null
    max_score: number | null
    content:   { answers?: Array<{ questionId: string; selectedIndex: number }> }
  } | null
  onComplete?:  (xpAwarded: number) => void
}

export default function QuizPlayer({ blockId, questions, blockXp = 0, existingSub, onComplete }: Props) {
  const maxScore = questions.reduce((s, q) => s + q.points, 0)

  // Map prior answers if graded
  const priorAnswers = new Map<string, number>(
    (existingSub?.content?.answers ?? []).map((a) => [a.questionId, a.selectedIndex])
  )

  const [answers,  setAnswers]  = useState<Map<string, number>>(
    existingSub ? priorAnswers : new Map()
  )
  const [result,   setResult]   = useState<{ gradePct?: number; earnedScore?: number; error?: string } | null>(null)
  const [pending,  startTransition] = useTransition()

  const isGraded   = existingSub?.status === 'graded' || !!result?.gradePct !== false && result !== null && !result.error
  const submitted  = isGraded

  function selectAnswer(questionId: string, index: number) {
    if (submitted) return
    setAnswers((prev) => new Map(prev).set(questionId, index))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (answers.size < questions.length) return
    startTransition(async () => {
      const answersArr = [...answers.entries()].map(([questionId, selectedIndex]) => ({
        questionId, selectedIndex
      }))
      const res = await submitQuiz(
        blockId,
        answersArr,
        questions.map((q) => ({ id: q.id, points: q.points, correct_index: q.correct_index })),
        maxScore,
        blockXp,
      )
      setResult(res)
      if (!res.error) {
        onComplete?.(res.xpAwarded ?? 0)
      }
    })
  }

  const displayGradePct = result?.gradePct ?? existingSub?.grade_pct
  const displayScore    = result?.earnedScore ?? existingSub?.score

  if (submitted && displayGradePct !== null && displayGradePct !== undefined) {
    const color = displayGradePct >= 90 ? 'emerald' : displayGradePct >= 70 ? 'amber' : 'rose'
    return (
      <div className="mt-6 space-y-4">
        <div className={`rounded-xl border border-${color}-200 bg-${color}-50 px-5 py-4`}>
          <p className={`text-lg font-extrabold text-${color}-700`}>
            {displayScore}/{maxScore} — {displayGradePct}%
          </p>
          <p className={`text-sm text-${color}-600 mt-0.5`}>
            {displayGradePct >= 90 ? 'Excellent work!' : displayGradePct >= 70 ? 'Good job — keep it up!' : 'Keep studying and try again.'}
          </p>
        </div>

        {/* Show correct answers */}
        <div className="space-y-4">
          {questions.map((q, qi) => {
            const chosen  = priorAnswers.get(q.id) ?? answers.get(q.id)
            const correct = q.correct_index
            return (
              <div key={q.id} className="bg-white border border-border rounded-xl p-5">
                <p className="text-sm font-semibold text-foreground mb-3">
                  {qi + 1}. {q.text}
                  <span className="ml-2 text-xs text-muted-foreground">({q.points}pt{q.points !== 1 ? 's' : ''})</span>
                </p>
                <div className="space-y-2">
                  {q.options.map((opt, oi) => (
                    <div
                      key={oi}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm border',
                        oi === correct ? 'border-emerald-300 bg-emerald-50 text-emerald-800' :
                        oi === chosen && oi !== correct ? 'border-rose-300 bg-rose-50 text-rose-800' :
                        'border-border bg-slate-50 text-muted-foreground'
                      )}
                    >
                      <span className="text-xs font-bold">
                        {oi === correct ? '✓' : oi === chosen ? '✗' : String.fromCharCode(65 + oi)}
                      </span>
                      {opt}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const allAnswered = answers.size === questions.length

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {questions.map((q, qi) => (
        <div key={q.id} className="bg-white border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-3">
            {qi + 1}. {q.text}
            <span className="ml-2 text-xs text-muted-foreground">({q.points}pt{q.points !== 1 ? 's' : ''})</span>
          </p>
          <div className="space-y-2" role="radiogroup" aria-label={`Question ${qi + 1}`}>
            {q.options.map((opt, oi) => {
              const selected = answers.get(q.id) === oi
              return (
                <button
                  key={oi}
                  type="button"
                  role="radio"
                  aria-checked={selected ? 'true' : 'false'}
                  onClick={() => selectAnswer(q.id, oi)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm border text-left transition-all',
                    selected
                      ? 'border-primary bg-primary/5 text-foreground font-medium'
                      : 'border-border hover:border-primary/40 hover:bg-slate-50 text-muted-foreground'
                  )}
                >
                  <span className={cn(
                    'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold',
                    selected ? 'border-primary bg-primary text-white' : 'border-slate-300'
                  )}>
                    {selected ? '●' : String.fromCharCode(65 + oi)}
                  </span>
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {result?.error && (
        <p className="text-sm text-rose-600" role="alert">{result.error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !allAnswered}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {pending ? 'Submitting…' : `Submit Quiz (${answers.size}/${questions.length} answered)`}
        </button>
      </div>
    </form>
  )
}
