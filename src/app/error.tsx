'use client'

// Root-level error boundary.
// Catches any error not caught by a segment-level boundary.
// Phase 2: add /admin/error.tsx, /courses/error.tsx, etc.
// for segment-specific error handling and recovery.

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Never log error.message or error.stack in production — they may contain
    // sensitive path info or user data. Replace this block with your error
    // tracking service (e.g. Sentry.captureException(error)).
    if (process.env.NODE_ENV !== 'production') {
      console.error('Global error boundary caught:', error)
    }
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-2xl font-semibold">Something went wrong</h2>
      <p className="max-w-md text-muted-foreground">
        We hit an unexpected problem. Your work has been saved.
        Please try again — if this keeps happening, contact your administrator.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}
      <div className="flex gap-3">
        <button onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/dashboard" className="btn btn-outline">
          Return to dashboard
        </Link>
      </div>
    </div>
  )
}
