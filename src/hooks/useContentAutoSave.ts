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

  const flush = useCallback(async () => {
    if (!pendingRef.current || savingRef.current) return
    const content = pendingRef.current
    savingRef.current = true
    setSaveState('saving')

    const result = await saveAction(content)
    savingRef.current = false

    if (result.error) {
      setSaveState('error')
    } else {
      setSaveState('saved')
      setLastSaved(new Date())
      pendingRef.current = null
    }
  }, [saveAction])

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
