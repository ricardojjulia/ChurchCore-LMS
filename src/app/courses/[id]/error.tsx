'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { captureError } from '@/lib/monitoring'

export default function CourseDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [errorId, setErrorId] = useState<string | null>(null)

  useEffect(() => {
    const id = captureError(error, { segment: 'courses/[id]', digest: error.digest })
    setErrorId(id)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-8 text-center">
      <div className="space-y-2 max-w-md">
        <h2 className="text-xl font-semibold text-foreground">Couldn&apos;t load this course</h2>
        <p className="text-sm text-muted-foreground">
          Something went wrong while loading the course. Your progress is safe — try again
          or browse other courses.
        </p>
        {errorId && (
          <p className="text-xs text-muted-foreground font-mono">Ref: {errorId}</p>
        )}
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/courses" className="btn btn-outline">
          Browse courses
        </Link>
      </div>
    </div>
  )
}
