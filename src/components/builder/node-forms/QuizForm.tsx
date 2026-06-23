'use client'

import { useState, useEffect } from 'react'
import type { BlockFormData, QuizQuestion } from '@/types/blocks'
import { FormShell, Field, XpField } from './FormShell'
import { createClient } from '@/utils/supabase/client'

type QuestionType = 'multiple_choice' | 'true_false' | 'matching' | 'fill_blank'

interface BankDraw {
  bank_id: string
  count:   number
}

interface AvailableBank {
  id:   string
  name: string
}

interface Props {
  initial?: {
    title?: string
    instructions?: string
    questions?: QuizQuestion[]
    bank_draws?: BankDraw[]
    time_limit_minutes?: number | null | string
    attempts_allowed?: number
    requirements?: { minimum_grade_pct?: number }
    gamification?: { base_xp_reward?: number }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

function newId() { return Math.random().toString(36).slice(2) }

function newQuestion(): QuizQuestion {
  return {
    id: newId(),
    text: '',
    type: 'multiple_choice',
    options: ['', '', '', ''],
    correct_index: 0,
    points: 10,
  }
}

export default function QuizForm({ initial, onSave, onCancel }: Props) {
  const [title,        setTitle]        = useState(initial?.title ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [questions,    setQuestions]    = useState<QuizQuestion[]>(
    initial?.questions?.length ? initial.questions : [newQuestion()]
  )
  const [timeLimit,       setTimeLimit]       = useState(initial?.time_limit_minutes ?? '')
  const [attempts,        setAttempts]        = useState(initial?.attempts_allowed ?? 2)
  const [minGrade,        setMinGrade]        = useState(initial?.requirements?.minimum_grade_pct ?? 80)
  const [xp,              setXp]              = useState(initial?.gamification?.base_xp_reward ?? 150)
  const [bankDraws,       setBankDraws]       = useState<BankDraw[]>(initial?.bank_draws ?? [])
  const [availableBanks,  setAvailableBanks]  = useState<AvailableBank[]>([])
  const [selectedBankId,  setSelectedBankId]  = useState('')
  const [drawCount,       setDrawCount]       = useState(5)

  // Load available question banks for this org
  useEffect(() => {
    createClient()
      .from('question_banks')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data }) => setAvailableBanks((data ?? []) as AvailableBank[]))
  }, [])

  // ── Question field helpers ──────────────────────────────────────────────────

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
        if (type === 'true_false')
          return { ...q, type, options: ['True', 'False'], correct_index: 0, pairs: undefined, template: undefined, blanks: undefined }
        if (type === 'matching')
          return { ...q, type, options: [], correct_index: 0,
            pairs: [{ id: newId(), left: '', right: '' }, { id: newId(), left: '', right: '' }],
            template: undefined, blanks: undefined }
        if (type === 'fill_blank')
          return { ...q, type, options: [], correct_index: 0, pairs: undefined, template: '', blanks: [] }
        // multiple_choice
        return { ...q, type, options: ['', '', '', ''], correct_index: 0, pairs: undefined, template: undefined, blanks: undefined }
      })
    )
  }

  // Matching helpers
  function addPair(qi: number) {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qi) return q
      return { ...q, pairs: [...(q.pairs ?? []), { id: newId(), left: '', right: '' }] }
    }))
  }

  function removePair(qi: number, pi: number) {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qi) return q
      return { ...q, pairs: (q.pairs ?? []).filter((_, j) => j !== pi) }
    }))
  }

  function updatePair(qi: number, pi: number, side: 'left' | 'right', value: string) {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qi) return q
      const pairs = (q.pairs ?? []).map((p, j) => j === pi ? { ...p, [side]: value } : p)
      return { ...q, pairs }
    }))
  }

  // Fill-blank helpers
  function updateTemplate(qi: number, template: string) {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qi) return q
      const count = (template.match(/\[blank\]/gi) ?? []).length
      const existing = q.blanks ?? []
      const blanks = Array.from({ length: count }, (_, k) =>
        existing[k] ?? { id: newId(), acceptable_answers: [] }
      )
      return { ...q, template, blanks }
    }))
  }

  function updateBlankAnswers(qi: number, bi: number, csv: string) {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qi) return q
      const blanks = (q.blanks ?? []).map((b, j) =>
        j === bi ? { ...b, acceptable_answers: csv.split(',').map((s) => s.trim()).filter(Boolean) } : b
      )
      return { ...q, blanks }
    }))
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const invalid = questions.some((q) => {
      if (!q.text.trim()) return true
      if (q.type === 'matching')
        return !q.pairs?.length || q.pairs.some((p) => !p.left.trim() || !p.right.trim())
      if (q.type === 'fill_blank')
        return !q.template?.trim() || !q.blanks?.length
      return false
    })
    if (invalid) return
    onSave({
      title: title.trim(),
      content: {
        instructions:       instructions.trim(),
        questions,
        bank_draws:         bankDraws,
        time_limit_minutes: timeLimit ? Number(timeLimit) : null,
        attempts_allowed:   attempts,
        requirements:       { minimum_grade_pct: minGrade },
      },
      gamification: { base_xp_reward: xp },
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

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
          <label className="label mb-0">
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

                  {/* Type selector + points */}
                  <div className="flex gap-3">
                    <select
                      value={q.type}
                      onChange={(e) => setQuestionType(qi, e.target.value as QuestionType)}
                      title="Question type"
                      className="input flex-1"
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="true_false">True / False</option>
                      <option value="matching">Matching</option>
                      <option value="fill_blank">Fill in the Blank</option>
                    </select>
                    <input
                      type="number" min={1} max={100} value={q.points} title="Points for this question"
                      onChange={(e) => updateQuestion(qi, { points: Number(e.target.value) })}
                      className="input w-20" placeholder="pts"
                    />
                  </div>

                  {/* Multiple choice / True-False */}
                  {(q.type === 'multiple_choice' || q.type === 'true_false') && (
                    <div className="space-y-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            checked={q.correct_index === oi}
                            onChange={() => updateQuestion(qi, { correct_index: oi })}
                            aria-label={`Mark option ${oi + 1} as correct`}
                            title={`Mark option ${oi + 1} as correct`}
                            className="shrink-0 accent-indigo-500"
                          />
                          <input
                            value={opt}
                            onChange={(e) => updateOption(qi, oi, e.target.value)}
                            placeholder={q.type === 'true_false' ? opt : `Option ${oi + 1}`}
                            disabled={q.type === 'true_false'}
                            className={`input${q.type === 'true_false' ? ' opacity-60' : ''}`}
                          />
                        </div>
                      ))}
                      <p className="text-xs text-slate-500 pl-5">Select the correct answer.</p>
                    </div>
                  )}

                  {/* Matching */}
                  {q.type === 'matching' && (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-400">
                        Enter matching pairs — left column → right column.
                      </p>
                      {(q.pairs ?? []).map((pair, pi) => (
                        <div key={pair.id} className="flex items-center gap-2">
                          <input
                            value={pair.left}
                            onChange={(e) => updatePair(qi, pi, 'left', e.target.value)}
                            placeholder={`Left ${pi + 1}`}
                            className="input flex-1"
                            required
                          />
                          <span className="text-slate-500 shrink-0 text-xs">→</span>
                          <input
                            value={pair.right}
                            onChange={(e) => updatePair(qi, pi, 'right', e.target.value)}
                            placeholder={`Right ${pi + 1}`}
                            className="input flex-1"
                            required
                          />
                          {(q.pairs ?? []).length > 2 && (
                            <button
                              type="button"
                              onClick={() => removePair(qi, pi)}
                              className="text-slate-600 hover:text-rose-400 transition-colors text-sm shrink-0"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addPair(qi)}
                        className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        + Add Pair
                      </button>
                    </div>
                  )}

                  {/* Fill in the Blank */}
                  {q.type === 'fill_blank' && (
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">
                          Template — use <code className="bg-slate-700 px-1 rounded">[blank]</code> for each blank.
                        </p>
                        <textarea
                          value={q.template ?? ''}
                          onChange={(e) => updateTemplate(qi, e.target.value)}
                          placeholder='The fruit of the Spirit is [blank], joy, and [blank].'
                          rows={3}
                          className="input resize-none"
                          required
                        />
                      </div>
                      {(q.blanks ?? []).length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-400">
                            Acceptable answers per blank (comma-separated, case-insensitive):
                          </p>
                          {(q.blanks ?? []).map((blank, bi) => (
                            <div key={blank.id} className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 w-16 shrink-0">Blank {bi + 1}:</span>
                              <input
                                value={blank.acceptable_answers.join(', ')}
                                onChange={(e) => updateBlankAnswers(qi, bi, e.target.value)}
                                placeholder="love, charity"
                                className="input flex-1"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          Add <code className="bg-slate-700 px-1 rounded">[blank]</code> to the template to define blanks.
                        </p>
                      )}
                    </div>
                  )}
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

      {/* Draw from Question Bank */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Draw from Bank</label>
        </div>

        {bankDraws.length > 0 && (
          <div className="space-y-2 mb-3">
            {bankDraws.map((draw, di) => {
              const bank = availableBanks.find((b) => b.id === draw.bank_id)
              return (
                <div key={di} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-2.5">
                  <span className="text-xs text-slate-300 flex-1 truncate">
                    {draw.count} question{draw.count !== 1 ? 's' : ''} from{' '}
                    <strong>{bank?.name ?? draw.bank_id}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setBankDraws((prev) => prev.filter((_, i) => i !== di))}
                    className="text-slate-600 hover:text-rose-400 transition-colors text-sm shrink-0"
                    aria-label="Remove bank draw"
                    title="Remove bank draw"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {availableBanks.length > 0 ? (
          <div className="flex gap-2 items-center">
            <select
              value={selectedBankId}
              onChange={(e) => setSelectedBankId(e.target.value)}
              title="Select question bank"
              className="input flex-1"
            >
              <option value="">— Select a bank —</option>
              {availableBanks.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <input
              type="number" min={1} max={50} value={drawCount}
              title="Number of questions to draw"
              onChange={(e) => setDrawCount(Number(e.target.value))}
              className="input w-20"
              placeholder="N"
            />
            <button
              type="button"
              onClick={() => {
                if (!selectedBankId) return
                setBankDraws((prev) => [...prev, { bank_id: selectedBankId, count: drawCount }])
                setSelectedBankId('')
              }}
              disabled={!selectedBankId}
              className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-40 shrink-0"
            >
              + Add Draw
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            No question banks available.{' '}
            <a href="/admin/question-banks" target="_blank" rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline">
              Create one →
            </a>
          </p>
        )}
      </div>

      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
