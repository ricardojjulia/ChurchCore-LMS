'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FlashcardContent } from '@/types/blocks'

export default function FlashcardPlayer({
  content,
  onComplete,
}: {
  content:     Partial<FlashcardContent>
  onComplete?: (xpAwarded: number) => void
}) {
  const t = useTranslations('learning.activities')
  const cards = content.cards ?? []
  const [index, setIndex] = useState(0)
  const [showBack, setShowBack] = useState(false)
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const completed = useRef(false)

  if (cards.length === 0) return <p className="italic text-muted-foreground">{t('emptyActivity')}</p>

  const card = cards[index]

  function flip() {
    const nextShowBack = !showBack
    setShowBack(nextShowBack)
    if (nextShowBack && !seen.has(card.id)) {
      const nextSeen = new Set(seen).add(card.id)
      setSeen(nextSeen)
      // Complete once every card's answer has been viewed.
      if (!completed.current && nextSeen.size === cards.length) {
        completed.current = true
        onComplete?.(0)
      }
    }
  }

  function go(delta: number) {
    setIndex((i) => Math.min(cards.length - 1, Math.max(0, i + delta)))
    setShowBack(false)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700" aria-live="polite">{t('cardOf', { current: index + 1, total: cards.length })}</p>
      <div className="flex min-h-48 items-center justify-center rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
        <p aria-live="polite" className="whitespace-pre-wrap text-lg font-semibold text-foreground">{showBack ? card.back : card.front}</p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(-1)} disabled={index === 0}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-40">
          {t('previousCard')}
        </button>
        <button type="button" onClick={flip} aria-pressed={showBack}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
          {showBack ? t('flipBack') : t('flipCard')}
        </button>
        <button type="button" onClick={() => go(1)} disabled={index === cards.length - 1}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-40">
          {t('nextCard')}
        </button>
      </div>
      {seen.size === cards.length && <p role="status" className="text-sm font-medium text-emerald-800">{t('flashcardsDone')}</p>}
    </div>
  )
}
