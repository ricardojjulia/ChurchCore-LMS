'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { getMyActivityState, saveChecklistProgress } from '@/app/actions/activities'
import type { ChecklistContent } from '@/types/blocks'

export default function ChecklistPlayer({
  blockId,
  content,
  onComplete,
}: {
  blockId:     string
  content:     Partial<ChecklistContent>
  onComplete?: (xpAwarded: number) => void
}) {
  const t = useTranslations('learning.activities')
  const items = content.items ?? []
  const [checked, setChecked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const completedOnce = useRef(false)
  // Set on the first tick: a slow initial load must never overwrite the
  // learner's own clicks (it resolved late and reset progress).
  const touched = useRef(false)
  // Saves run one at a time so a slower earlier save can't land after (and
  // overwrite) a later one.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    getMyActivityState(blockId).then((s) => {
      if (touched.current) return
      setChecked(s.checked ?? [])
      const required = items.filter((i) => i.required)
      if (required.length && required.every((i) => (s.checked ?? []).includes(i.id))) completedOnce.current = true
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per block
  }, [blockId])

  if (items.length === 0) return <p className="italic text-slate-400">{t('emptyActivity')}</p>

  function toggle(id: string) {
    touched.current = true
    const next = checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id]
    setChecked(next)
    setError(null)
    startTransition(async () => {
      const run = saveChain.current.then(() => saveChecklistProgress(blockId, next))
      saveChain.current = run.catch(() => {})
      const res = await run
      if (res.error) { setError(res.error); return }
      if (res.complete && !completedOnce.current) {
        completedOnce.current = true
        onComplete?.(0)
      }
    })
  }

  const done = items.filter((i) => checked.includes(i.id)).length
  const requiredDone = items.filter((i) => i.required).every((i) => checked.includes(i.id))

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-slate-300" aria-live="polite">
        {t('checklistProgress', { done, total: items.length })}
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-200 hover:bg-slate-800/80 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={checked.includes(item.id)}
                onChange={() => toggle(item.id)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                {item.text}
                {!item.required && <span className="ml-2 text-xs text-slate-400">({t('optionalTag')})</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {requiredDone && <p role="status" className="text-sm font-medium text-emerald-400">{t('checklistComplete')}</p>}
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
    </div>
  )
}
