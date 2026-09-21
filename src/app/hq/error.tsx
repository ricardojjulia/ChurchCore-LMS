'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'

export default function HQError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="max-w-md space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Project HQ unavailable</h2>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load HQ. The error has been logged.
        </p>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/dashboard" className="btn btn-outline">
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
