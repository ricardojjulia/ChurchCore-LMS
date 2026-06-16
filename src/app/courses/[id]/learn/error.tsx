'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { captureError } from '@/lib/monitoring'

export default function LearnError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const params = useParams()
  const courseId = typeof params?.id === 'string' ? params.id : null
  const [errorId, setErrorId] = useState<string | null>(null)

  useEffect(() => {
    const id = captureError(error, {
      segment: 'courses/[id]/learn',
      courseId,
      digest: error.digest,
    })
    setErrorId(id)
  }, [error, courseId])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <div className="space-y-2 max-w-md">
        <h2 className="text-xl font-semibold text-foreground">Module failed to load</h2>
        <p className="text-sm text-muted-foreground">
          Your progress has been saved. You can continue from where you left off.
        </p>
        {errorId && (
          <p className="text-sm font-mono font-semibold text-muted-foreground border border-border rounded px-3 py-1 inline-block">
            Ref: {errorId}
          </p>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        {courseId && (
          <Link href={`/courses/${courseId}`} className="btn btn-primary">
            Return to course outline
          </Link>
        )}
        <button type="button" onClick={reset} className="btn btn-outline">
          Try reloading this module
        </button>
      </div>
    </div>
  )
}
