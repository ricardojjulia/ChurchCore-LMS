'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'churchcore_focus_mode'

export function useFocusMode(): [boolean, () => void] {
  const [isFocusMode, setIsFocusMode] = useState(false)

  useEffect(() => {
    try {
      setIsFocusMode(localStorage.getItem(STORAGE_KEY) === 'true')
    } catch {
      // localStorage unavailable — default to false
    }
  }, [])

  const toggle = useCallback(() => {
    setIsFocusMode((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, String(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  return [isFocusMode, toggle]
}
