'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  upsertQuestionBank,
  addBankQuestion,
  deleteBankQuestion,
} from '@/app/actions/admin'
import type { QuizQuestion } from '@/types/blocks'

type QuestionType = 'multiple_choice' | 'true_false' | 'matching' | 'fill_blank'

interface BankQuestion {
  id:               string
  question_type:    string
  question_content: Record<string, unknown>
  created_at:       string
}

interface Props {
  bankId:            string | null
  initialBank:       { id: string; name: string; description: string | null } | null
  initialQuestions:  BankQuestion[]
}

function newId() { return Math.random().toString(36).slice(2) }

const TYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  true_false:      'True / False',
  matching:        'Matching',
  fill_blank:      'Fill in the Blank',
}

function QuestionPreview({ q }: { q: BankQuestion }) {
  const content = q.question_content as Partial<QuizQuestion>
  const text    = (content.text ?? '') as string
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
        {TYPE_LABEL[q.question_type as QuestionType] ?? q.question_type}
      </span>
      <p className="text-sm text-foreground line-clamp-2">{text || <em className="text-muted-foreground">No text</em>}</p>
    </div>
  )
}

// Inline question builder (simplified — just the fields needed per type)
interface QuestionDraft {
  type:          QuestionType
  text:          string
  options:       string[]
  correct_index: number
  points:        number
  pairs:         Array<{ id: string; left: string; right: string }>
  template:      string
  blanks:        Array<{ id: string; acceptable_answers: string[] }>
}

function emptyDraft(): QuestionDraft {
  return {
    type: 'multiple_choice',
    text: '',
    options: ['', '', '', ''],
    correct_index: 0,
    points: 10,
    pairs: [{ id: newId(), left: '', right: '' }, { id: newId(), left: '', right: '' }],
    template: '',
    blanks: [],
  }
}

function draftToContent(d: QuestionDraft): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id:            newId(),
    text:          d.text.trim(),
    type:          d.type,
    points:        d.points,
    options:       d.options,
    correct_index: d.correct_index,
  }
  if (d.type === 'matching')   base.pairs   = d.pairs
  if (d.type === 'fill_blank') { base.template = d.template; base.blanks = d.blanks }
  return base
}

function AddQuestionForm({ onAdd }: { onAdd: (d: QuestionDraft) => void }) {
  const [draft,   setDraft]   = useState<QuestionDraft>(emptyDraft)
  const [visible, setVisible] = useState(false)

  function setType(type: QuestionType) {
    setDraft((prev) => ({
      ...emptyDraft(),
      type,
      options: type === 'true_false'
        ? ['True', 'False']
        : type === 'matching' || type === 'fill_blank'
          ? []
          : ['', '', '', ''],
      pairs: prev.pairs,
    }))
  }

  function updatePair(pi: number, side: 'left' | 'right', val: string) {
    setDraft((prev) => ({
      ...prev,
      pairs: prev.pairs.map((p, j) => j === pi ? { ...p, [side]: val } : p),
    }))
  }

  function updateTemplate(template: string) {
    const count = (template.match(/\[blank\]/gi) ?? []).length
    setDraft((prev) => ({
      ...prev,
      template,
      blanks: Array.from({ length: count }, (_, k) =>
        prev.blanks[k] ?? { id: newId(), acceptable_answers: [] }
      ),
    }))
  }

  function updateBlankAnswers(bi: number, csv: string) {
    setDraft((prev) => ({
      ...prev,
      blanks: prev.blanks.map((b, j) =>
        j === bi ? { ...b, acceptable_answers: csv.split(',').map((s) => s.trim()).filter(Boolean) } : b
      ),
    }))
  }

  function handleAdd() {
    if (!draft.text.trim()) return
    if (draft.type === 'matching' && draft.pairs.some((p) => !p.left.trim() || !p.right.trim())) return
    if (draft.type === 'fill_blank' && (!draft.template.trim() || !draft.blanks.length)) return
    onAdd(draft)
    setDraft(emptyDraft())
    setVisible(false)
  }

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="w-full border-2 border-dashed border-border rounded-xl py-3 text-sm font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
      >
        + Add Question
      </button>
    )
  }

  return (
    <div className="bg-slate-50 border border-border rounded-xl p-4 space-y-3">
      <div className="flex gap-3">
        <select
          value={draft.type}
          onChange={(e) => setType(e.target.value as QuestionType)}
          title="Question type"
          className="border border-border rounded-lg px-3 py-2 text-sm bg-white flex-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        <input
          type="number" min={1} max={100} value={draft.points}
          title="Points"
          onChange={(e) => setDraft((prev) => ({ ...prev, points: Number(e.target.value) }))}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-white w-20 focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="pts"
        />
      </div>

      <textarea
        value={draft.text}
        onChange={(e) => setDraft((prev) => ({ ...prev, text: e.target.value }))}
        placeholder="Question text…"
        rows={2}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
      />

      {/* MC / TF options */}
      {(draft.type === 'multiple_choice' || draft.type === 'true_false') && (
        <div className="space-y-2">
          {draft.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input
                type="radio"
                name="draft-correct"
                checked={draft.correct_index === oi}
                onChange={() => setDraft((prev) => ({ ...prev, correct_index: oi }))}
                aria-label={`Mark option ${oi + 1} as correct`}
                title={`Mark option ${oi + 1} as correct`}
                className="shrink-0 accent-primary"
              />
              <input
                value={opt}
                onChange={(e) => setDraft((prev) => {
                  const options = [...prev.options]; options[oi] = e.target.value
                  return { ...prev, options }
                })}
                placeholder={draft.type === 'true_false' ? opt : `Option ${oi + 1}`}
                disabled={draft.type === 'true_false'}
                className={`flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30${draft.type === 'true_false' ? ' opacity-60' : ''}`}
              />
            </div>
          ))}
          <p className="text-xs text-slate-500">Select the correct answer (radio).</p>
        </div>
      )}

      {/* Matching */}
      {draft.type === 'matching' && (
        <div className="space-y-2">
          {draft.pairs.map((pair, pi) => (
            <div key={pair.id} className="flex items-center gap-2">
              <input
                value={pair.left}
                onChange={(e) => updatePair(pi, 'left', e.target.value)}
                placeholder={`Left ${pi + 1}`}
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-slate-400 text-xs shrink-0">→</span>
              <input
                value={pair.right}
                onChange={(e) => updatePair(pi, 'right', e.target.value)}
                placeholder={`Right ${pi + 1}`}
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {draft.pairs.length > 2 && (
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, pairs: prev.pairs.filter((_, j) => j !== pi) }))}
                  className="text-rose-400 hover:text-rose-600 text-sm shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, pairs: [...prev.pairs, { id: newId(), left: '', right: '' }] }))}
            className="text-xs font-bold text-primary hover:text-primary/80 transition-colors"
          >
            + Add Pair
          </button>
        </div>
      )}

      {/* Fill-blank */}
      {draft.type === 'fill_blank' && (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">
              Use <code className="bg-slate-200 px-1 rounded">[blank]</code> for each blank.
            </p>
            <textarea
              value={draft.template}
              onChange={(e) => updateTemplate(e.target.value)}
              placeholder='The fruit of the Spirit is [blank] and [blank].'
              rows={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          {draft.blanks.map((blank, bi) => (
            <div key={blank.id} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-16 shrink-0">Blank {bi + 1}:</span>
              <input
                value={blank.acceptable_answers.join(', ')}
                onChange={(e) => updateBlankAnswers(bi, e.target.value)}
                placeholder="love, charity"
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleAdd}
          className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          Add to Bank
        </button>
        <button
          type="button"
          onClick={() => { setDraft(emptyDraft()); setVisible(false) }}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors px-3"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function BankDetailClient({ bankId, initialBank, initialQuestions }: Props) {
  const router  = useRouter()
  const isNew   = !bankId
  const [name,        setName]        = useState(initialBank?.name ?? '')
  const [description, setDescription] = useState(initialBank?.description ?? '')
  const [questions,   setQuestions]   = useState<BankQuestion[]>(initialQuestions)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [saved,       setSaved]       = useState(false)
  const [activeBankId, setActiveBankId] = useState<string | null>(bankId)

  async function handleSaveBank(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError(null)
    const res = await upsertQuestionBank({ id: activeBankId ?? undefined, name, description })
    setSaving(false)
    if (res.error) { setError(res.error); return }
    if (isNew && res.id) {
      setActiveBankId(res.id)
      // Update URL without full navigation
      router.replace(`/admin/question-banks/${res.id}`)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleAddQuestion(draft: QuestionDraft) {
    const currentBankId = activeBankId
    if (!currentBankId) {
      setError('Save the bank details first before adding questions.')
      return
    }
    const content = draftToContent(draft)
    const res = await addBankQuestion({
      bankId:          currentBankId,
      questionType:    draft.type,
      questionContent: content,
    })
    if (res.error) { setError(res.error); return }
    setQuestions((prev) => [...prev, {
      id:               res.id!,
      question_type:    draft.type,
      question_content: content,
      created_at:       new Date().toISOString(),
    }])
  }

  async function handleDeleteQuestion(questionId: string) {
    const res = await deleteBankQuestion(questionId)
    if (res.error) { setError(res.error); return }
    setQuestions((prev) => prev.filter((q) => q.id !== questionId))
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <a href="/admin/question-banks" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        ← Question Banks
      </a>

      {/* Bank details form */}
      <div>
        <h1 className="text-2xl font-extrabold text-foreground mb-6">
          {isNew ? 'New Question Bank' : 'Edit Question Bank'}
        </h1>

        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2 mb-4" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSaveBank} className="bg-white border border-border rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              Bank Name <span className="text-rose-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. New Testament Survey"
              required
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of this question pool."
              rows={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : isNew ? 'Create Bank' : 'Save Changes'}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-medium">Saved ✓</span>}
          </div>
        </form>
      </div>

      {/* Questions section — only shown after bank exists */}
      {activeBankId && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">
              Questions ({questions.length})
            </h2>
          </div>

          <div className="space-y-2 mb-4">
            {questions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">
                No questions yet — add one below.
              </p>
            ) : (
              questions.map((q) => (
                <div key={q.id} className="bg-white border border-border rounded-xl px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <QuestionPreview q={q} />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(q.id)}
                    className="text-rose-400 hover:text-rose-600 text-sm transition-colors shrink-0"
                    aria-label="Remove question"
                    title="Remove question"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          <AddQuestionForm onAdd={handleAddQuestion} />
        </div>
      )}

      {!activeBankId && (
        <p className="text-sm text-muted-foreground italic">
          Create the bank first to start adding questions.
        </p>
      )}
    </div>
  )
}
