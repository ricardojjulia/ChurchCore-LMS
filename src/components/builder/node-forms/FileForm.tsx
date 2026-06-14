'use client'

import { useState } from 'react'
import type { BlockFormData } from '@/types/blocks'
import { FormShell, Field, XpField } from './FormShell'

const FILE_TYPES = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'other']

interface Props {
  initial?: {
    title?: string
    file_url?: string
    file_type?: string
    gamification?: { base_xp_reward?: number }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

export default function FileForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [fileUrl, setFileUrl] = useState(initial?.file_url ?? '')
  const [fileType, setFileType] = useState(initial?.file_type ?? 'pdf')
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 5)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !fileUrl.trim()) return
    onSave({
      title: title.trim(),
      content: { file_url: fileUrl.trim(), file_type: fileType },
      gamification: { base_xp_reward: xp },
    })
  }

  return (
    <FormShell title="File" icon="📁" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Title" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Course Syllabus" className="input" required />
      </Field>
      <Field label="File URL" required hint="Paste a direct link (Supabase Storage, Google Drive, Dropbox, etc.).">
        <input type="url" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)}
          placeholder="https://..." className="input" required />
      </Field>
      <Field label="File Type">
        <select value={fileType} onChange={(e) => setFileType(e.target.value)} className="input">
          {FILE_TYPES.map((t) => (
            <option key={t} value={t}>{t.toUpperCase()}</option>
          ))}
        </select>
      </Field>
      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
