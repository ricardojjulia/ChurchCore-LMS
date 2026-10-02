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

  if (cards.length === 0) return <p className="italic text-slate-400">{t('emptyActivity')}</p>

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
      <p className="text-sm text-slate-400" aria-live="polite">{t('cardOf', { current: index + 1, total: cards.length })}</p>
      <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-sm">
        <p aria-live="polite" className="whitespace-pre-wrap text-lg font-semibold text-white">{showBack ? card.back : card.front}</p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(-1)} disabled={index === 0}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 hover:text-white disabled:opacity-40 transition-colors">
          {t('previousCard')}
        </button>
        <button type="button" onClick={flip} aria-pressed={showBack}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm">
          {showBack ? t('flipBack') : t('flipCard')}
        </button>
        <button type="button" onClick={() => go(1)} disabled={index === cards.length - 1}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 hover:text-white disabled:opacity-40 transition-colors">
          {t('nextCard')}
        </button>
      </div>
      {seen.size === cards.length && <p role="status" className="text-sm font-medium text-emerald-400">{t('flashcardsDone')}</p>}
    </div>
  )
}
