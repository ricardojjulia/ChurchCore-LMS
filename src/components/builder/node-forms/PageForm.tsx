'use client'

import { useState } from 'react'
import type { BlockFormData } from '@/types/blocks'
import { FormShell, Field, XpField } from './FormShell'

interface Props {
  initial?: { title?: string; content?: string; gamification?: { base_xp_reward?: number } }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

export default function PageForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 10)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    onSave({
      title: title.trim(),
      content: { content: content.trim() },
      gamification: { base_xp_reward: xp },
    })
  }

  return (
    <FormShell title="Page" icon="📄" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Title" required>
        <input
          value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Introduction to Genesis"
          className="input" required
        />
      </Field>
      <Field label="Content" required hint="Markdown or plain text supported.">
        <textarea
          value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="Write your page content here…"
          rows={10} className="input resize-y" required
        />
      </Field>
      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
