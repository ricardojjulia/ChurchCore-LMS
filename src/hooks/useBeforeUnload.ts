'use client'

import { useEffect } from 'react'

export function useBeforeUnload(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return

    function handler(e: BeforeUnloadEvent) {
      e.preventDefault()
      // Modern browsers show a generic message; the string here is ignored.
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])
}
