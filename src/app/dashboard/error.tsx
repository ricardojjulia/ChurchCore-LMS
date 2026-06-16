'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { captureError } from '@/lib/monitoring'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [errorId, setErrorId] = useState<string | null>(null)

  useEffect(() => {
    const id = captureError(error, { segment: 'dashboard', digest: error.digest })
    setErrorId(id)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-8 text-center">
      <div className="space-y-2 max-w-md">
        <h2 className="text-xl font-semibold text-foreground">Dashboard failed to load</h2>
        <p className="text-sm text-muted-foreground">
          We hit an unexpected problem. Your data is safe — try again or return home.
        </p>
        {errorId && (
          <p className="text-xs text-muted-foreground font-mono">Ref: {errorId}</p>
        )}
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-outline">
          Return to home
        </Link>
      </div>
    </div>
  )
}
