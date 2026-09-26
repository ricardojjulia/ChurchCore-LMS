'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SaveState } from '@/components/editor/SaveIndicator'

export function useContentAutoSave(
  saveAction: (content: object) => Promise<{ error?: string }>,
  debounceMs = 800
) {
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<object | null>(null)
  const savingRef  = useRef(false)

  const flushRef   = useRef<() => Promise<void>>(async () => {})

  // Saves the latest pending content. If a save is already in flight, the
  // newer content is saved as soon as it finishes. (Previously a debounce that
  // fired mid-save returned early, and the in-flight save then cleared the
  // newer pending content — edits typed during a save were silently lost while
  // the indicator still said "Saved".)
  const flush = useCallback(async () => {
    const content = pendingRef.current
    if (!content || savingRef.current) return
    savingRef.current = true
    setSaveState('saving')

    const result = await saveAction(content)
    savingRef.current = false

    if (result.error) {
      setSaveState('error')
      return
    }
    if (pendingRef.current === content) {
      pendingRef.current = null
      setSaveState('saved')
      setLastSaved(new Date())
    } else if (pendingRef.current) {
      // Newer edits arrived while saving — save them too.
      void flushRef.current()
    }
  }, [saveAction])
  flushRef.current = flush

  const scheduleSave = useCallback((content: object) => {
    pendingRef.current = content
    setSaveState('saving') // optimistic — shows saving immediately on keypress
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, debounceMs)
  }, [flush, debounceMs])

  // Flush on unmount if there's a pending save
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (pendingRef.current) flush()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { scheduleSave, saveState, lastSaved }
}
