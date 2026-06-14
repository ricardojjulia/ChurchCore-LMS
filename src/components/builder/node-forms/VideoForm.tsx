'use client'

import { useState } from 'react'
import type { BlockFormData } from '@/types/blocks'
import { FormShell, Field, XpField, Toggle } from './FormShell'

interface Props {
  initial?: {
    title?: string
    url?: string
    duration_minutes?: number | string
    requirements?: { must_view?: boolean }
    gamification?: { base_xp_reward?: number }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

export default function VideoForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [duration, setDuration] = useState(initial?.duration_minutes ?? '')
  const [mustView, setMustView] = useState(initial?.requirements?.must_view ?? true)
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 50)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !url.trim()) return
    onSave({
      title: title.trim(),
      content: {
        url: url.trim(),
        duration_minutes: duration ? Number(duration) : undefined,
        requirements: { must_view: mustView },
      },
      gamification: { base_xp_reward: xp },
    })
  }

  return (
    <FormShell title="Video" icon="🎥" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Title" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Lecture 1: Introduction" className="input" required />
      </Field>
      <Field label="Video URL" required hint="YouTube, Vimeo, or direct .mp4 link.">
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=..." className="input" required />
      </Field>
      <Field label="Duration (minutes)" hint="Optional — helps students plan their time.">
        <input type="number" min={1} value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="e.g. 20" className="input" />
      </Field>
      <Toggle
        label="Viewing required"
        hint="Students must watch before progressing."
        value={mustView}
        onChange={setMustView}
      />
      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
