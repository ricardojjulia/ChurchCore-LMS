'use client'

import { useState } from 'react'
import type { BlockFormData } from '@/types/blocks'
import { FormShell, Field, XpField, Toggle } from './FormShell'

interface Props {
  initial?: {
    title?: string
    instructions?: string
    submission_type?: 'text' | 'file' | 'both'
    max_points?: number
    due_date?: string | null
    requirements?: { minimum_grade_pct?: number }
    gamification?: { base_xp_reward?: number; streak_bonus_eligible?: boolean }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

export default function AssignmentForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [submissionType, setSubmissionType] = useState<'text' | 'file' | 'both'>(
    initial?.submission_type ?? 'text'
  )
  const [maxPoints, setMaxPoints] = useState(initial?.max_points ?? 100)
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '')
  const [minGrade, setMinGrade] = useState(initial?.requirements?.minimum_grade_pct ?? 0)
  const [streakBonus, setStreakBonus] = useState(initial?.gamification?.streak_bonus_eligible ?? true)
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 200)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !instructions.trim()) return
    onSave({
      title: title.trim(),
      content: {
        instructions: instructions.trim(),
        submission_type: submissionType,
        max_points: maxPoints,
        due_date: dueDate || null,
        requirements: { minimum_grade_pct: minGrade || undefined },
      },
      gamification: { base_xp_reward: xp, streak_bonus_eligible: streakBonus },
    })
  }

  return (
    <FormShell title="Assignment" icon="✅" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Title" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Week 1 Reflection Essay" className="input" required />
      </Field>
      <Field label="Instructions" required hint="Describe what students need to do and submit.">
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
          placeholder="Write a 500-word reflection on…" rows={6}
          className="input resize-y" required />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Submission Type">
          <select value={submissionType}
            onChange={(e) => setSubmissionType(e.target.value as 'text' | 'file' | 'both')}
            title="Submission type" className="input">
            <option value="text">Text entry</option>
            <option value="file">File upload</option>
            <option value="both">Text + File</option>
          </select>
        </Field>
        <Field label="Max Points">
          <input type="number" min={1} max={1000} value={maxPoints} title="Max points"
            onChange={(e) => setMaxPoints(Number(e.target.value))} className="input" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Due Date" hint="Optional.">
          <input type="datetime-local" value={dueDate ?? ''} title="Due date"
            onChange={(e) => setDueDate(e.target.value)} className="input" />
        </Field>
        <Field label="Minimum Grade to Progress (%)" hint="0 = no gate.">
          <input type="number" min={0} max={100} value={minGrade} title="Minimum grade percentage"
            onChange={(e) => setMinGrade(Number(e.target.value))} className="input" />
        </Field>
      </div>
      <Toggle
        label="Streak bonus eligible"
        hint="Students on a streak get extra XP for this."
        value={streakBonus}
        onChange={setStreakBonus}
      />
      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
