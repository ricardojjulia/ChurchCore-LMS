'use client'

import { useState } from 'react'
import type { BlockFormData, Flashcard } from '@/types/blocks'
import { FormShell, Field, XpField } from './FormShell'

interface Props {
  initial?: {
    title?: string
    cards?: Flashcard[]
    gamification?: { base_xp_reward?: number }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

const newCard = (): Flashcard => ({ id: crypto.randomUUID(), front: '', back: '' })

export default function FlashcardForm({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [cards, setCards] = useState<Flashcard[]>(initial?.cards?.length ? initial.cards : [newCard()])
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 10)

  const update = (i: number, patch: Partial<Flashcard>) =>
    setCards((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const clean = cards
      .map((c) => ({ ...c, front: c.front.trim(), back: c.back.trim() }))
      .filter((c) => c.front && c.back)
    if (!title.trim() || clean.length === 0) return
    onSave({ title: title.trim(), content: { cards: clean }, gamification: { base_xp_reward: xp } })
  }

  return (
    <FormShell title="Flashcards" icon="🗂️" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Title" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Books of the Bible" className="input" required />
      </Field>
      {cards.map((card, i) => (
        <div key={card.id} className="grid grid-cols-[1fr_1fr_auto] items-start gap-3">
          <textarea aria-label={`Card ${i + 1} front`} value={card.front} onChange={(e) => update(i, { front: e.target.value })}
            placeholder="Front (question)" rows={2} className="input resize-y" />
          <textarea aria-label={`Card ${i + 1} back`} value={card.back} onChange={(e) => update(i, { back: e.target.value })}
            placeholder="Back (answer)" rows={2} className="input resize-y" />
          <button type="button" onClick={() => setCards((cs) => cs.filter((_, j) => j !== i))}
            disabled={cards.length === 1}
            aria-label={`Remove card ${i + 1}`}
            className="mt-2 text-xs font-semibold text-rose-400 hover:text-rose-300 disabled:opacity-30">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setCards((cs) => [...cs, newCard()])}
        className="text-sm font-semibold text-indigo-300 hover:text-indigo-200">
        + Add card
      </button>
      <XpField value={xp} onChange={setXp} />
    </FormShell>
  )
}
