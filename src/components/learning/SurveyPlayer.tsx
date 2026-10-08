'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { getMyActivityState, submitSurvey } from '@/app/actions/activities'
import type { SurveyContent } from '@/types/blocks'
import { CheckCircle2, ShieldCheck, User } from 'lucide-react'

export default function SurveyPlayer({
  blockId,
  content,
  onComplete,
}: {
  blockId: string
  content: Partial<SurveyContent>
  onComplete?: (xpAwarded: number) => void
}) {
  const t = useTranslations('learning.activities')
  const questions = content.questions ?? []
  const anonymous = content.anonymous ?? true
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [responded, setResponded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    getMyActivityState(blockId)
      .then((s) => setResponded(!!s.responded))
      .catch(() => {})
  }, [blockId])

  if (questions.length === 0) return <p className="italic text-slate-400">{t('emptyActivity')}</p>

  if (responded) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-emerald-900/60 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-emerald-200">Feedback Submitted</h3>
        <p className="text-xs text-emerald-300 max-w-sm mx-auto">{t('surveyThanks')}</p>
      </div>
    )
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await submitSurvey(blockId, answers)
      if (res.error) {
        setError(res.error)
        return
      }
      setResponded(true)
      onComplete?.(0)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Privacy Notice Banner */}
      <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
        {anonymous ? (
          <>
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              <strong>Anonymous Evaluation:</strong> Your responses are confidential and never linked to your personal profile.
            </span>
          </>
        ) : (
          <>
            <User className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>
              <strong>Named Feedback:</strong> Your instructor will see your name attached to this submission.
            </span>
          </>
        )}
      </div>

      {/* Question Items */}
      <div className="space-y-4">
        {questions.map((q, i) => (
          <fieldset
            key={q.id}
            className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3 transition-colors hover:border-slate-700"
          >
            <legend className="px-1 text-sm font-semibold text-white">
              <span className="text-indigo-400 mr-1.5">#{i + 1}</span> {q.text}
            </legend>

            {/* Scale 1–5 Selector */}
            {q.type === 'scale' && (
              <div className="pt-2 space-y-2">
                <div className="grid grid-cols-5 gap-2 max-w-md">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const isSelected = answers[q.id] === n
                    return (
                      <label
                        key={n}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border cursor-pointer transition text-xs font-bold ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                            : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          value={n}
                          checked={isSelected}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                          className="sr-only"
                        />
                        <span className="text-sm">{n}</span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex justify-between max-w-md px-1 text-[11px] text-slate-400 font-medium">
                  <span>1 - Strongly Disagree / Poor</span>
                  <span>5 - Strongly Agree / Excellent</span>
                </div>
              </div>
            )}

            {/* Multiple Choice Radio List */}
            {q.type === 'choice' && (
              <div className="pt-2 space-y-2">
                {(q.options ?? []).map((opt) => {
                  const isSelected = answers[q.id] === opt
                  return (
                    <label
                      key={opt}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition text-xs font-medium ${
                        isSelected
                          ? 'bg-indigo-950/60 text-indigo-200 border-indigo-500'
                          : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        value={opt}
                        checked={isSelected}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                        className="w-4 h-4 text-indigo-600 bg-slate-900 border-slate-700"
                      />
                      <span>{opt}</span>
                    </label>
                  )
                })}
              </div>
            )}

            {/* Open-ended Text */}
            {q.type === 'text' && (
              <div className="pt-1">
                <textarea
                  aria-label={`${t('textAnswerLabel')}: ${q.text}`}
                  value={(answers[q.id] as string) ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  maxLength={2000}
                  rows={3}
                  placeholder="Share your thoughts, suggestions, or reflections..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                />
              </div>
            )}
          </fieldset>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition disabled:opacity-50"
      >
        {pending ? t('submitting') : 'Submit Course Evaluation'}
      </button>
    </form>
  )
}
