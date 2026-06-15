'use client'

import { useState } from 'react'
import type { BlockFormData } from '@/types/blocks'
import { FormShell, Field, XpField } from './FormShell'
import RichTextEditor from '@/components/editor/RichTextEditor'

interface Props {
  initial?: {
    title?:        string
    body?:         object | string
    gamification?: { base_xp_reward?: number }
  }
  onSave:   (data: BlockFormData) => void
  onCancel: () => void
}

export default function PageForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body,  setBody]  = useState<object>(() => {
    // Accept legacy string or Tiptap JSON object
    if (!initial?.body) return { type: 'doc', content: [] }
    if (typeof initial.body === 'string') return { type: 'doc', content: [] }
    return initial.body
  })
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 10)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      content: { body, format_version: 'tiptap-v2' },
      gamification: { base_xp_reward: xp },
    })
  }

  return (
    <FormShell title="Page" icon="📄" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Title" required>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Introduction to Genesis"
          className="input"
          required
        />
      </Field>

      <Field label="Content" hint="Rich text — headings, lists, bold, images.">
        <RichTextEditor
          content={body}
          onChange={setBody}
          placeholder="Write your page content here…"
          minHeight="240px"
        />
      </Field>

      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
