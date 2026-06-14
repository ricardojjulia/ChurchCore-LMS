'use client'

import { useState } from 'react'
import type { BlockFormData, QuizQuestion } from '@/types/blocks'
import { FormShell, Field, XpField } from './FormShell'

type QuestionType = 'multiple_choice' | 'true_false'

interface Props {
  initial?: {
    title?: string
    instructions?: string
    questions?: QuizQuestion[]
    time_limit_minutes?: number | null | string
    attempts_allowed?: number
    requirements?: { minimum_grade_pct?: number }
    gamification?: { base_xp_reward?: number }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

function newQuestion(): QuizQuestion {
  return {
    id: Math.random().toString(36).slice(2),
    text: '',
    type: 'multiple_choice',
    options: ['', '', '', ''],
    correct_index: 0,
    points: 10,
  }
}

export default function QuizForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [questions, setQuestions] = useState<QuizQuestion[]>(
    initial?.questions?.length ? initial.questions : [newQuestion()]
  )
  const [timeLimit, setTimeLimit] = useState(initial?.time_limit_minutes ?? '')
  const [attempts, setAttempts] = useState(initial?.attempts_allowed ?? 2)
  const [minGrade, setMinGrade] = useState(initial?.requirements?.minimum_grade_pct ?? 80)
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 150)

  function updateQuestion(index: number, patch: Partial<QuizQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)))
  }

  function updateOption(qIndex: number, oIndex: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q
        const options = [...q.options]
        options[oIndex] = value
        return { ...q, options }
      })
    )
  }

  function setQuestionType(index: number, type: QuestionType) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== index) return q
        return {
          ...q,
          type,
          options: type === 'true_false' ? ['True', 'False'] : ['', '', '', ''],
          correct_index: 0,
        }
      })
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || questions.some((q) => !q.text.trim())) return
    onSave({
      title: title.trim(),
      content: {
        instructions: instructions.trim(),
        questions,
        time_limit_minutes: timeLimit ? Number(timeLimit) : null,
        attempts_allowed: attempts,
        requirements: { minimum_grade_pct: minGrade },
      },
      gamification: { base_xp_reward: xp },
    })
  }

  return (
    <FormShell title="Quiz" icon="🧠" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Title" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Module 1 Knowledge Check" className="input" required />
      </Field>
      <Field label="Instructions" hint="Shown to students before they start.">
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
          placeholder="Answer all questions. You have 2 attempts." rows={2}
          className="input resize-none" />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Time Limit (min)" hint="Leave blank for unlimited.">
          <input type="number" min={1} value={timeLimit} title="Time limit in minutes"
            onChange={(e) => setTimeLimit(e.target.value)} placeholder="—" className="input" />
        </Field>
        <Field label="Attempts Allowed">
          <input type="number" min={1} max={10} value={attempts} title="Attempts allowed"
            onChange={(e) => setAttempts(Number(e.target.value))} className="input" />
        </Field>
        <Field label="Min Grade to Pass (%)">
          <input type="number" min={0} max={100} value={minGrade}
            onChange={(e) => setMinGrade(Number(e.target.value))} className="input" />
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="label" style={{ marginBottom: 0 }}>
            Questions <span className="text-rose-500">*</span>
          </label>
          <button
            type="button"
            onClick={() => setQuestions((prev) => [...prev, newQuestion()])}
            className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            + Add Question
          </button>
        </div>

        <div className="space-y-4">
          {questions.map((q, qi) => (
            <div key={q.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-xs font-bold text-slate-500 mt-2.5 w-4 shrink-0">{qi + 1}.</span>
                <div className="flex-1 space-y-3">
                  <input
                    value={q.text}
                    onChange={(e) => updateQuestion(qi, { text: e.target.value })}
                    placeholder="Question text…"
                    className="input" required
                  />
                  <div className="flex gap-3">
                    <select
                      value={q.type}
                      onChange={(e) => setQuestionType(qi, e.target.value as QuestionType)}
                      title="Question type"
                      className="input" style={{ flex: 1 }}
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="true_false">True / False</option>
                    </select>
                    <input
                      type="number" min={1} max={100} value={q.points} title="Points for this question"
                      onChange={(e) => updateQuestion(qi, { points: Number(e.target.value) })}
                      className="input" style={{ width: 80 }} placeholder="pts"
                    />
                  </div>
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${q.id}`}
                          checked={q.correct_index === oi}
                          onChange={() => updateQuestion(qi, { correct_index: oi })}
                          aria-label={`Mark option ${oi + 1} as correct`}
                          className="shrink-0 accent-indigo-500"
                        />
                        <input
                          value={opt}
                          onChange={(e) => updateOption(qi, oi, e.target.value)}
                          placeholder={q.type === 'true_false' ? opt : `Option ${oi + 1}`}
                          disabled={q.type === 'true_false'}
                          className="input"
                          style={{ opacity: q.type === 'true_false' ? 0.6 : 1 }}
                        />
                      </div>
                    ))}
                    <p className="text-xs text-slate-500 pl-5">Select the correct answer.</p>
                  </div>
                </div>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== qi))}
                    className="text-slate-600 hover:text-rose-400 transition-colors text-sm mt-1 shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
