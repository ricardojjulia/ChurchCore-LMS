'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'

export default function PlatformError({
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
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-lg font-semibold text-slate-100">Platform console error</h2>
      <p className="text-sm text-slate-400 max-w-sm">
        Something went wrong loading the platform admin console. The error has been logged.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="rounded px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Back to app
        </Link>
      </div>
    </div>
  )
}
