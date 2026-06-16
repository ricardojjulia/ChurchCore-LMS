'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { captureError } from '@/lib/monitoring'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [errorId, setErrorId] = useState<string | null>(null)

  useEffect(() => {
    const id = captureError(error, { segment: 'admin', digest: error.digest })
    setErrorId(id)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-8 text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 border border-amber-200">
        <AlertTriangle className="w-6 h-6 text-amber-600" aria-hidden="true" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-xl font-semibold text-foreground">Something went wrong in Admin</h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. Our team has been notified.
        </p>
        {errorId && (
          <p className="text-xs text-muted-foreground font-mono">Ref: {errorId}</p>
        )}
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/dashboard" className="btn btn-outline">
          Return to Dashboard
        </Link>
      </div>
    </div>
  )
}
