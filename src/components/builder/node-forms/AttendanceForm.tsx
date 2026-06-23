'use client'

import { useState } from 'react'
import type { BlockFormData } from '@/types/blocks'
import { FormShell, Field, XpField, Toggle } from './FormShell'

interface Props {
  initial?: {
    title?:           string
    session_title?:   string
    tracking_mode?:   'auto' | 'manual' | 'both'
    points_possible?: number
    gamification?:    { base_xp_reward?: number; streak_bonus_eligible?: boolean }
  }
  onSave:   (data: BlockFormData) => void
  onCancel: () => void
}

export default function AttendanceForm({ initial, onSave, onCancel }: Props) {
  const [title,        setTitle]       = useState(initial?.title ?? '')
  const [sessionTitle, setSession]     = useState(initial?.session_title ?? '')
  const [mode,         setMode]        = useState<'auto' | 'manual' | 'both'>(
    initial?.tracking_mode ?? 'both'
  )
  const [points,       setPoints]      = useState(initial?.points_possible ?? 10)
  const [streakBonus,  setStreakBonus] = useState(initial?.gamification?.streak_bonus_eligible ?? true)
  const [xp,           setXp]          = useState(initial?.gamification?.base_xp_reward ?? 50)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      content: {
        session_title:   sessionTitle.trim() || null,
        tracking_mode:   mode,
        points_possible: points,
      },
      gamification: { base_xp_reward: xp, streak_bonus_eligible: streakBonus },
    })
  }

  return (
    <FormShell title="Attendance" icon="🗓️" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Block Title" required>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Week 3 Attendance"
          className="input"
          required
        />
      </Field>

      <Field label="Session Label" hint="Optional note shown to students (e.g. 'Sunday, June 22').">
        <input
          value={sessionTitle}
          onChange={(e) => setSession(e.target.value)}
          placeholder="e.g. Sunday, June 22 – Morning Service"
          className="input"
        />
      </Field>

      <Field
        label="Tracking Mode"
        hint="Auto marks the student present when they open this block. Manual means the teacher records attendance."
      >
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          className="input"
          aria-label="Tracking mode"
        >
          <option value="both">Auto + Manual (teacher can override)</option>
          <option value="auto">Auto only (student opens block = present)</option>
          <option value="manual">Manual only (teacher marks each student)</option>
        </select>
      </Field>

      <Field label="Points Possible" hint="Set 0 for attendance tracking with no grade impact.">
        <input
          type="number"
          value={points}
          onChange={(e) => setPoints(Math.max(0, +e.target.value))}
          min={0}
          max={1000}
          step={1}
          className="input"
          aria-label="Points possible"
        />
      </Field>

      <XpField value={xp} onChange={setXp} />
      <Toggle label="Streak Bonus Eligible" value={streakBonus} onChange={setStreakBonus} />
    </FormShell>
  )
}
