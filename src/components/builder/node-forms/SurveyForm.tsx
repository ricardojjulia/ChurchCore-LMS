'use client'

import { useState } from 'react'
import type { BlockFormData, SurveyQuestion } from '@/types/blocks'
import { FormShell, Field, XpField, Toggle } from './FormShell'

interface Props {
  initial?: {
    title?:     string
    questions?: SurveyQuestion[]
    anonymous?: boolean
    gamification?: { base_xp_reward?: number }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

const newQuestion = (): SurveyQuestion => ({ id: crypto.randomUUID(), text: '', type: 'scale', options: [] })

export default function SurveyForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [questions, setQuestions] = useState<SurveyQuestion[]>(initial?.questions?.length ? initial.questions : [newQuestion()])
  const [anonymous, setAnonymous] = useState(initial?.anonymous ?? true)
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 10)

  const update = (i: number, patch: Partial<SurveyQuestion>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const clean = questions
      .map((q) => ({
        ...q,
        text: q.text.trim(),
        options: q.type === 'choice' ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
      }))
      .filter((q) => q.text && (q.type !== 'choice' || (q.options?.length ?? 0) >= 2))
    if (!title.trim() || clean.length === 0) return
    onSave({ title: title.trim(), content: { questions: clean, anonymous }, gamification: { base_xp_reward: xp } })
  }

  return (
    <FormShell title="Survey" icon="📊" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Title" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Class feedback" className="input" required />
      </Field>
      <Toggle
        label="Anonymous responses"
        hint="Responses are stored without names. This can't be changed once anyone has responded."
        value={anonymous}
        onChange={setAnonymous}
      />
      {questions.map((q, i) => (
        <div key={q.id} className="space-y-3 rounded-xl border border-slate-700 p-4">
          <input
            aria-label={`Question ${i + 1} text`}
            value={q.text}
            onChange={(e) => update(i, { text: e.target.value })}
            placeholder="Question text"
            className="input"
          />
          <div className="flex items-center gap-3">
            <select
              aria-label={`Question ${i + 1} type`}
              value={q.type}
              onChange={(e) => update(i, { type: e.target.value as SurveyQuestion['type'] })}
              className="input"
            >
              <option value="scale">Scale (1–5)</option>
              <option value="choice">Multiple choice</option>
              <option value="text">Free text</option>
            </select>
            <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
              disabled={questions.length === 1}
              className="text-xs font-semibold text-rose-400 hover:text-rose-300 disabled:opacity-30">
              Remove
            </button>
          </div>
          {q.type === 'choice' && (
            <textarea
              aria-label={`Question ${i + 1} options, one per line`}
              value={(q.options ?? []).join('\n')}
              onChange={(e) => update(i, { options: e.target.value.split('\n') })}
              placeholder={'One option per line (at least two)'}
              rows={3}
              className="input resize-y"
            />
          )}
        </div>
      ))}
      <button type="button" onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
        className="text-sm font-semibold text-indigo-300 hover:text-indigo-200">
        + Add question
      </button>
      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
