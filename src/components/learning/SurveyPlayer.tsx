'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { getMyActivityState, submitSurvey } from '@/app/actions/activities'
import type { SurveyContent } from '@/types/blocks'

export default function SurveyPlayer({
  blockId,
  content,
  onComplete,
}: {
  blockId:     string
  content:     Partial<SurveyContent>
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
    getMyActivityState(blockId).then((s) => setResponded(!!s.responded)).catch(() => {})
  }, [blockId])

  if (questions.length === 0) return <p className="italic text-muted-foreground">{t('emptyActivity')}</p>
  if (responded) {
    return <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{t('surveyThanks')}</p>
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await submitSurvey(blockId, answers)
      if (res.error) { setError(res.error); return }
      setResponded(true)
      onComplete?.(0)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <p className="text-sm text-muted-foreground">{anonymous ? t('surveyIntroAnonymous') : t('surveyIntroNamed')}</p>
      {questions.map((q, i) => (
        <fieldset key={q.id} className="rounded-xl border border-border bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">{i + 1}. {q.text}</legend>
          {q.type === 'scale' && (
            <div className="mt-3">
              <div className="flex gap-2" role="radiogroup" aria-label={q.text}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="flex flex-col items-center gap-1 text-xs text-slate-700">
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      value={n}
                      checked={answers[q.id] === n}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                      className="h-4 w-4"
                    />
                    {n}
                  </label>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs text-slate-600">
                <span>{t('scaleLow')}</span><span>{t('scaleHigh')}</span>
              </div>
            </div>
          )}
          {q.type === 'choice' && (
            <div className="mt-3 space-y-2">
              {(q.options ?? []).map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                    className="h-4 w-4"
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}
          {q.type === 'text' && (
            <textarea
              aria-label={`${t('textAnswerLabel')}: ${q.text}`}
              value={(answers[q.id] as string) ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              maxLength={2000}
              rows={3}
              className="mt-3 w-full rounded-md border border-input px-3 py-2 text-sm"
            />
          )}
        </fieldset>
      ))}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? t('submitting') : t('submitSurvey')}
      </button>
    </form>
  )
}
