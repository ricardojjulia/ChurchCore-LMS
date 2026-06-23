'use client'

import { useState, useEffect, useRef, useTransition, useMemo } from 'react'
import { submitQuiz, loadQuizQuestions } from '@/app/actions/learning'
import type { QuizQuestion } from '@/types/blocks'
import { cn } from '@/lib/utils'

// Per-question answer: index for MC/TF, keyed record for matching/fill_blank
type AnswerValue = number | Record<string, string>

interface BankDraw {
  bank_id: string
  count:   number
}

interface Props {
  blockId:            string
  questions:          QuizQuestion[]
  blockXp?:           number
  timeLimitMinutes?:  number | null
  bankDraws?:         BankDraw[]
  attemptsAllowed?:   number
  attemptsUsed?:      number
  minimumGradePct?:   number
  existingSub?: {
    status:    string
    grade_pct: number | null
    score:     number | null
    max_score: number | null
    content:   { answers?: Array<Record<string, unknown>> }
  } | null
  onComplete?: (xpAwarded: number) => void
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Split a fill_blank template into text/blank segments
function parseTemplate(template: string) {
  const parts = template.split(/\[blank\]/gi)
  const result: Array<{ kind: 'text'; text: string } | { kind: 'blank'; index: number }> = []
  parts.forEach((text, i) => {
    result.push({ kind: 'text', text })
    if (i < parts.length - 1) result.push({ kind: 'blank', index: i })
  })
  return result
}

export default function QuizPlayer({
  blockId,
  questions: staticQuestions,
  blockXp = 0,
  timeLimitMinutes,
  bankDraws,
  attemptsAllowed = 0,
  attemptsUsed = 0,
  minimumGradePct = 0,
  existingSub,
  onComplete,
}: Props) {
  // If bank draws exist, resolve them server-side on mount
  const [resolvedQuestions, setResolvedQuestions] = useState<QuizQuestion[] | null>(
    bankDraws?.length ? null : staticQuestions
  )
  const [loadingBank, setLoadingBank] = useState(!!bankDraws?.length)

  useEffect(() => {
    if (!bankDraws?.length) return
    loadQuizQuestions({ blockId }).then(({ questions }) => {
      setResolvedQuestions(questions.length ? questions : staticQuestions)
      setLoadingBank(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId])

  const questions = resolvedQuestions ?? staticQuestions

  const maxScore = questions.reduce((s, q) => s + q.points, 0)
  const timerKey = `quiz_timer_${blockId}`

  const [answers,  setAnswers]  = useState<Map<string, AnswerValue>>(new Map())
  const [result,   setResult]   = useState<{ gradePct?: number; earnedScore?: number; error?: string } | null>(null)
  const [pending,  startTransition] = useTransition()
  const [timeLeft, setTimeLeft] = useState<number | null>(
    timeLimitMinutes ? timeLimitMinutes * 60 : null
  )
  const formRef          = useRef<HTMLFormElement>(null)
  const autoSubmittedRef = useRef(false)

  if (loadingBank) {
    return (
      <div className="mt-6 flex items-center gap-3 text-muted-foreground text-sm">
        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span>Preparing quiz…</span>
      </div>
    )
  }

  // Attempts exhausted — show locked state, no form
  if (attemptsAllowed > 0 && attemptsUsed >= attemptsAllowed && !existingSub) {
    return (
      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-6 text-center space-y-2">
        <p className="text-2xl">🔒</p>
        <p className="font-semibold text-foreground">No attempts remaining</p>
        <p className="text-sm text-muted-foreground">
          This quiz allows {attemptsAllowed} attempt{attemptsAllowed !== 1 ? 's' : ''}. You have used all of them.
        </p>
      </div>
    )
  }

  const isGraded = existingSub?.status === 'graded' || (result !== null && !result.error)
  const submitted = isGraded

  // Shuffle right-side options once per matching question (stable across re-renders)
  const shuffledRights = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const q of questions) {
      if (q.type === 'matching' && q.pairs) {
        const rights = [...q.pairs.map((p) => p.right)]
        for (let i = rights.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[rights[i], rights[j]] = [rights[j], rights[i]]
        }
        map.set(q.id, rights)
      }
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId])

  // Restore timer from localStorage on mount
  useEffect(() => {
    if (!timeLimitMinutes || submitted) return
    try {
      const stored = localStorage.getItem(timerKey)
      if (stored) {
        const secs = parseInt(stored)
        if (!isNaN(secs) && secs > 0) setTimeLeft(secs)
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clear timer when already graded
  useEffect(() => {
    if (submitted) {
      try { localStorage.removeItem(timerKey) } catch {}
    }
  }, [submitted, timerKey])

  // Countdown tick
  useEffect(() => {
    if (timeLeft === null || submitted) return
    if (timeLeft <= 0) {
      try { localStorage.removeItem(timerKey) } catch {}
      if (!autoSubmittedRef.current) {
        autoSubmittedRef.current = true
        formRef.current?.requestSubmit()
      }
      return
    }
    const id = setTimeout(() => {
      setTimeLeft((prev) => {
        if (prev === null) return null
        const next = prev - 1
        try { localStorage.setItem(timerKey, String(next)) } catch {}
        return next
      })
    }, 1000)
    return () => clearTimeout(id)
  }, [timeLeft, timerKey, submitted])

  // ── Answer setters ──────────────────────────────────────────────────────────

  function setMcAnswer(questionId: string, index: number) {
    if (submitted) return
    setAnswers((prev) => new Map(prev).set(questionId, index))
  }

  function setMatchedPair(questionId: string, pairId: string, right: string) {
    if (submitted) return
    setAnswers((prev) => {
      const current = (prev.get(questionId) as Record<string, string> | undefined) ?? {}
      return new Map(prev).set(questionId, { ...current, [pairId]: right })
    })
  }

  function setBlankAnswer(questionId: string, blankIdx: number, text: string) {
    if (submitted) return
    setAnswers((prev) => {
      const current = (prev.get(questionId) as Record<string, string> | undefined) ?? {}
      return new Map(prev).set(questionId, { ...current, [String(blankIdx)]: text })
    })
  }

  // ── allAnswered ─────────────────────────────────────────────────────────────

  const allAnswered = questions.every((q) => {
    const ans = answers.get(q.id)
    if (ans === undefined) return false
    if (q.type === 'matching') {
      const pairs = q.pairs ?? []
      if (!pairs.length) return false
      const matched = ans as Record<string, string>
      return pairs.every((p) => (matched[p.id] ?? '').trim().length > 0)
    }
    if (q.type === 'fill_blank') {
      const blanks = q.blanks ?? []
      if (!blanks.length) return false
      const filled = ans as Record<string, string>
      return blanks.every((_, i) => (filled[String(i)] ?? '').trim().length > 0)
    }
    return typeof ans === 'number'
  })

  // ── Submit ──────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Allow auto-submit (timer expiry) even with partial answers
    if (!allAnswered && !autoSubmittedRef.current) return
    try { localStorage.removeItem(timerKey) } catch {}
    startTransition(async () => {
      const answersArr = [...answers.entries()].map(([questionId, value]) => {
        if (typeof value === 'number') return { questionId, selectedIndex: value }
        const q = questions.find((q) => q.id === questionId)
        if (q?.type === 'matching') return { questionId, matchedPairs: value as Record<string, string> }
        return { questionId, blankAnswers: value as Record<string, string> }
      })
      const res = await submitQuiz(
        blockId,
        answersArr,
        questions.map((q) => ({
          id:            q.id,
          points:        q.points,
          correct_index: q.correct_index,
          type:          q.type,
          pairs:         q.pairs,
          blanks:        q.blanks,
        })),
        maxScore,
        blockXp,
      )
      setResult(res)
      if (!res.error) onComplete?.(res.xpAwarded ?? 0)
    })
  }

  // ── Result helper ───────────────────────────────────────────────────────────

  function getStoredAnswer(qId: string): AnswerValue | undefined {
    const fromState = answers.get(qId)
    if (fromState !== undefined) return fromState
    const stored = (existingSub?.content?.answers ?? []).find(
      (a) => (a as Record<string, unknown>).questionId === qId
    )
    if (!stored) return undefined
    const a = stored as Record<string, unknown>
    if (a.selectedIndex !== undefined) return a.selectedIndex as number
    if (a.matchedPairs !== undefined) return a.matchedPairs as Record<string, string>
    if (a.blankAnswers !== undefined) return a.blankAnswers as Record<string, string>
    return undefined
  }

  // ── Graded result view ──────────────────────────────────────────────────────

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

        <div className="space-y-4">
          {questions.map((q, qi) => {
            const storedAnswer = getStoredAnswer(q.id)
            return (
              <div key={q.id} className="bg-white border border-border rounded-xl p-5">
                <p className="text-sm font-semibold text-foreground mb-3">
                  {qi + 1}. {q.text}
                  <span className="ml-2 text-xs text-muted-foreground">({q.points}pt{q.points !== 1 ? 's' : ''})</span>
                </p>

                {/* MC / TF result */}
                {(q.type === 'multiple_choice' || q.type === 'true_false' || q.type === undefined) && (
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => {
                      const chosen  = typeof storedAnswer === 'number' ? storedAnswer : undefined
                      const correct = q.correct_index
                      return (
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
                      )
                    })}
                  </div>
                )}

                {/* Matching result */}
                {q.type === 'matching' && q.pairs && (
                  <div className="space-y-2">
                    {q.pairs.map((pair) => {
                      const matched = storedAnswer as Record<string, string> | undefined
                      const chosen  = matched?.[pair.id]
                      const correct = chosen === pair.right
                      return (
                        <div key={pair.id} className={cn(
                          'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm border',
                          correct ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                  : 'border-rose-300 bg-rose-50 text-rose-800'
                        )}>
                          <span className="text-xs font-bold">{correct ? '✓' : '✗'}</span>
                          <span className="font-medium">{pair.left}</span>
                          <span className="text-muted-foreground mx-1">→</span>
                          <span>{chosen ?? <em className="opacity-60">No answer</em>}</span>
                          {!correct && (
                            <span className="ml-auto text-xs text-emerald-700 font-medium">
                              Correct: {pair.right}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Fill-blank result */}
                {q.type === 'fill_blank' && q.blanks && (
                  <div className="space-y-2">
                    {q.blanks.map((blank, bi) => {
                      const filled  = storedAnswer as Record<string, string> | undefined
                      const given   = (filled?.[String(bi)] ?? '').trim()
                      const correct = blank.acceptable_answers.some(
                        (a) => a.toLowerCase().trim() === given.toLowerCase()
                      )
                      return (
                        <div key={blank.id} className={cn(
                          'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm border',
                          correct ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                  : 'border-rose-300 bg-rose-50 text-rose-800'
                        )}>
                          <span className="text-xs font-bold">{correct ? '✓' : '✗'}</span>
                          <span>Blank {bi + 1}: <strong>{given || <em className="opacity-60">No answer</em>}</strong></span>
                          {!correct && (
                            <span className="ml-auto text-xs text-emerald-700 font-medium">
                              Accepted: {blank.acceptable_answers.join(' / ')}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Active quiz form ────────────────────────────────────────────────────────

  const timerUrgent = timeLeft !== null && timeLeft <= 60
  const answeredCount = questions.filter((q) => {
    const ans = answers.get(q.id)
    if (ans === undefined) return false
    if (q.type === 'matching') {
      const pairs = q.pairs ?? []
      const matched = ans as Record<string, string>
      return pairs.some((p) => (matched[p.id] ?? '').trim().length > 0)
    }
    if (q.type === 'fill_blank') {
      const blanks = q.blanks ?? []
      const filled = ans as Record<string, string>
      return blanks.some((_, i) => (filled[String(i)] ?? '').trim().length > 0)
    }
    return typeof ans === 'number'
  }).length

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-4">
      {/* Attempt count + passing score info */}
      {(attemptsAllowed > 0 || minimumGradePct > 0) && (
        <div className="flex flex-wrap gap-2">
          {attemptsAllowed > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
              Attempt {attemptsUsed + 1} of {attemptsAllowed}
            </span>
          )}
          {minimumGradePct > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
              Passing score: {minimumGradePct}%
            </span>
          )}
        </div>
      )}

      {/* Timer */}
      {timeLeft !== null && (
        <div className={cn(
          'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold w-fit',
          timerUrgent
            ? 'bg-rose-50 border border-rose-200 text-rose-700'
            : 'bg-slate-50 border border-border text-muted-foreground'
        )}>
          <span aria-hidden="true">{timerUrgent ? '⏰' : '⏱'}</span>
          <span>{formatTime(timeLeft)} remaining</span>
        </div>
      )}

      {questions.map((q, qi) => (
        <div key={q.id} className="bg-white border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-3">
            {qi + 1}. {q.text}
            <span className="ml-2 text-xs text-muted-foreground">({q.points}pt{q.points !== 1 ? 's' : ''})</span>
          </p>

          {/* Multiple Choice / True-False */}
          {(q.type === 'multiple_choice' || q.type === 'true_false' || q.type === undefined) && (
            <div className="space-y-2" role="radiogroup" aria-label={`Question ${qi + 1}`}>
              {q.options.map((opt, oi) => {
                const selected = answers.get(q.id) === oi
                return (
                  <button
                    key={oi}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMcAnswer(q.id, oi)}
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
          )}

          {/* Matching */}
          {q.type === 'matching' && q.pairs && (
            <div className="space-y-2">
              {q.pairs.map((pair) => {
                const matched  = (answers.get(q.id) as Record<string, string> | undefined) ?? {}
                const selected = matched[pair.id] ?? ''
                const rights   = shuffledRights.get(q.id) ?? q.pairs!.map((p) => p.right)
                return (
                  <div key={pair.id} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">
                      {pair.left}
                    </span>
                    <span className="text-muted-foreground text-xs shrink-0">→</span>
                    <select
                      value={selected}
                      onChange={(e) => setMatchedPair(q.id, pair.id, e.target.value)}
                      title={`Match for: ${pair.left}`}
                      className={cn(
                        'flex-1 border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30',
                        selected ? 'border-primary text-foreground' : 'border-border text-muted-foreground'
                      )}
                    >
                      <option value="">— Select —</option>
                      {rights.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          )}

          {/* Fill in the Blank */}
          {q.type === 'fill_blank' && q.template !== undefined && (
            <div className="text-sm text-foreground leading-loose">
              {parseTemplate(q.template).map((seg, si) => {
                if (seg.kind === 'text') return <span key={si}>{seg.text}</span>
                const filled = (answers.get(q.id) as Record<string, string> | undefined) ?? {}
                return (
                  <input
                    key={si}
                    type="text"
                    value={filled[String(seg.index)] ?? ''}
                    onChange={(e) => setBlankAnswer(q.id, seg.index, e.target.value)}
                    aria-label={`Blank ${seg.index + 1} for question ${qi + 1}`}
                    title={`Blank ${seg.index + 1}`}
                    placeholder={`Blank ${seg.index + 1}`}
                    className="inline-block border-b-2 border-primary bg-transparent mx-1 px-1 w-28 text-center focus:outline-none focus:border-primary/70"
                  />
                )
              })}
            </div>
          )}
        </div>
      ))}

      {result?.error && (
        <p className="text-sm text-rose-600" role="alert">{result.error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || (!allAnswered && !autoSubmittedRef.current)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {pending ? 'Submitting…' : `Submit Quiz (${answeredCount}/${questions.length} answered)`}
        </button>
      </div>
    </form>
  )
}
