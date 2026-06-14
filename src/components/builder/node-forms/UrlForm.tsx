'use client'

import { useState } from 'react'
import type { BlockFormData } from '@/types/blocks'
import { FormShell, Field, XpField, Toggle } from './FormShell'

interface Props {
  initial?: {
    title?: string
    url?: string
    requirements?: { must_view?: boolean }
    gamification?: { base_xp_reward?: number }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

export default function UrlForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [mustView, setMustView] = useState(initial?.requirements?.must_view ?? false)
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 5)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !url.trim()) return
    onSave({
      title: title.trim(),
      content: { url: url.trim(), requirements: { must_view: mustView } },
      gamification: { base_xp_reward: xp },
    })
  }

  return (
    <FormShell title="External URL" icon="🔗" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Title" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Read: The Bible Project Overview" className="input" required />
      </Field>
      <Field label="URL" required>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..." className="input" required />
      </Field>
      <Toggle
        label="Mark as required"
        hint="Students must visit this link before progressing."
        value={mustView}
        onChange={setMustView}
      />
      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
