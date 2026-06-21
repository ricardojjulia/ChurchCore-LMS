'use client'

import { useState, useEffect } from 'react'

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    setOffline(!navigator.onLine)

    const handleOnline  = () => setOffline(false)
    const handleOffline = () => setOffline(true)

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 text-center"
    >
      You are offline — interactive features (submissions, quizzes) are disabled.
    </div>
  )
}
