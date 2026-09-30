'use client'

import { useState } from 'react'
import type { BlockFormData, ChecklistItem } from '@/types/blocks'
import { FormShell, Field, XpField } from './FormShell'

interface Props {
  initial?: {
    title?: string
    items?: ChecklistItem[]
    gamification?: { base_xp_reward?: number }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

const newItem = (): ChecklistItem => ({ id: crypto.randomUUID(), text: '', required: true })

export default function ChecklistForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [items, setItems] = useState<ChecklistItem[]>(initial?.items?.length ? initial.items : [newItem()])
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 10)

  const update = (i: number, patch: Partial<ChecklistItem>) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const clean = items.map((x) => ({ ...x, text: x.text.trim() })).filter((x) => x.text)
    if (!title.trim() || clean.length === 0) return
    onSave({ title: title.trim(), content: { items: clean }, gamification: { base_xp_reward: xp } })
  }

  return (
    <FormShell title="Checklist" icon="✅" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Title" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Next steps this week" className="input" required />
      </Field>
      {items.map((item, i) => (
        <div key={item.id} className="flex items-center gap-3">
          <input
            aria-label={`Item ${i + 1}`}
            value={item.text}
            onChange={(e) => update(i, { text: e.target.value })}
            placeholder="e.g. Read Romans 1–3"
            className="input flex-1"
          />
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-300">
            <input type="checkbox" checked={item.required} onChange={(e) => update(i, { required: e.target.checked })} />
            Required
          </label>
          <button type="button" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
            disabled={items.length === 1}
            aria-label={`Remove item ${i + 1}`}
            className="text-xs font-semibold text-rose-400 hover:text-rose-300 disabled:opacity-30">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setItems((xs) => [...xs, newItem()])}
        className="text-sm font-semibold text-indigo-300 hover:text-indigo-200">
        + Add item
      </button>
      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
