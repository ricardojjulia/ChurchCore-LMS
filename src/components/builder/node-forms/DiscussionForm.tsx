'use client'

import { useState } from 'react'
import type { BlockFormData } from '@/types/blocks'
import { FormShell, Field, XpField } from './FormShell'

interface Props {
  initial?: {
    title?: string
    prompt?: string
    gamification?: { base_xp_reward?: number }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

export default function DiscussionForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 75)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !prompt.trim()) return
    onSave({
      title: title.trim(),
      content: { prompt: prompt.trim() },
      gamification: { base_xp_reward: xp },
    })
  }

  return (
    <FormShell title="Discussion" icon="💬" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Title" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Week 1: Your Faith Journey" className="input" required />
      </Field>
      <Field label="Discussion Prompt" required hint="What should students respond to?">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="Share how your faith journey began and what led you to this course…"
          rows={6} className="input resize-y" required />
      </Field>
      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
