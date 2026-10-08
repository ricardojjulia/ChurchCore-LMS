'use client'

import React, { useState } from 'react'
import type { BlockFormData, SurveyQuestion } from '@/types/blocks'
import { FormShell, Field, XpField, Toggle } from './FormShell'
import { FEEDBACK_TEMPLATES, instantiateFeedbackTemplate } from '@/lib/feedback/templates'
import { Sparkles, Trash2, Plus, GripVertical } from 'lucide-react'

interface Props {
  initial?: {
    title?: string
    questions?: SurveyQuestion[]
    anonymous?: boolean
    gamification?: { base_xp_reward?: number }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

const newQuestion = (): SurveyQuestion => ({
  id: crypto.randomUUID(),
  text: '',
  type: 'scale',
  options: [],
})

export default function SurveyForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [questions, setQuestions] = useState<SurveyQuestion[]>(
    initial?.questions?.length ? initial.questions : [newQuestion()]
  )
  const [anonymous, setAnonymous] = useState(initial?.anonymous ?? true)
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 10)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

  const update = (i: number, patch: Partial<SurveyQuestion>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))

  const handleApplyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId)
    if (!templateId) return

    const templateData = instantiateFeedbackTemplate(templateId)
    if (templateData) {
      if (!title.trim() || title === 'Survey' || title === 'Class feedback') {
        setTitle(templateData.title)
      }
      setAnonymous(templateData.anonymous)
      setQuestions(templateData.questions)
    }
  }

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

    onSave({
      title: title.trim(),
      content: { questions: clean, anonymous },
      gamification: { base_xp_reward: xp },
    })
  }

  return (
    <FormShell title="Course Feedback & Evaluation" icon="📊" onCancel={onCancel} onSubmit={handleSubmit}>
      {/* Template Preset Selector */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 to-purple-950/30 border border-indigo-800/50 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-indigo-300 uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Quick Feedback & Evaluation Templates</span>
        </div>
        <p className="text-xs text-zinc-400">
          Choose a pre-built evaluation template or customize your own questions below.
        </p>
        <select
          value={selectedTemplateId}
          onChange={(e) => handleApplyTemplate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">-- Choose a template preset --</option>
          {FEEDBACK_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.icon} {t.title} ({t.questions.length} items)
            </option>
          ))}
        </select>
      </div>

      <Field label="Evaluation / Survey Title" required>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. End-of-Course Evaluation"
          className="input"
          required
        />
      </Field>

      <Toggle
        label="Anonymous responses"
        hint="Responses are stored without student names to encourage honest, candid feedback."
        value={anonymous}
        onChange={setAnonymous}
      />

      {/* Questions Builder List */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Evaluation Items ({questions.length})
          </span>
        </div>

        {questions.map((q, i) => (
          <div
            key={q.id}
            className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-700"
          >
            <div className="flex items-start gap-2">
              <span className="text-xs font-mono font-bold text-indigo-400 mt-2.5">#{i + 1}</span>
              <div className="flex-1">
                <input
                  aria-label={`Question ${i + 1} text`}
                  value={q.text}
                  onChange={(e) => update(i, { text: e.target.value })}
                  placeholder="Question / Evaluation prompt"
                  className="input"
                  required
                />
              </div>
              <button
                type="button"
                onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                disabled={questions.length === 1}
                className="p-2 text-zinc-400 hover:text-red-400 disabled:opacity-30 transition"
                title="Remove Question"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs text-zinc-400">Response Type:</label>
              <select
                aria-label={`Question ${i + 1} type`}
                value={q.type}
                onChange={(e) => update(i, { type: e.target.value as SurveyQuestion['type'] })}
                className="input text-xs w-auto"
              >
                <option value="scale">Rating Scale (1–5 Likert)</option>
                <option value="choice">Multiple Choice (Options)</option>
                <option value="text">Open Reflection / Comments</option>
              </select>
            </div>

            {q.type === 'choice' && (
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400">Options (one per line, minimum 2):</label>
                <textarea
                  aria-label={`Question ${i + 1} options, one per line`}
                  value={(q.options ?? []).join('\n')}
                  onChange={(e) => update(i, { options: e.target.value.split('\n') })}
                  placeholder={'Option A\nOption B\nOption C'}
                  rows={3}
                  className="input text-xs resize-y"
                />
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-indigo-300 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Custom Item</span>
        </button>
      </div>

      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
