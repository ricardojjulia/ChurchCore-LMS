'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { enrollSelf } from '@/app/actions/learning'

export default function EnrollButton({
  courseId,
  locked = false,
  lockReason,
}: {
  courseId:    string
  locked?:     boolean
  lockReason?: string
}) {
  const [error, setError]   = useState<string | null>(null)
  const [pending, start]    = useTransition()
  const router              = useRouter()

  if (locked) {
    return (
      <div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex items-center gap-2 bg-slate-200 text-slate-500 font-bold px-6 py-3 rounded-xl cursor-not-allowed text-sm"
        >
          🔒 Enrollment Locked
        </button>
        {lockReason && (
          <p className="text-xs text-slate-500 mt-2">{lockReason}</p>
        )}
      </div>
    )
  }

  async function handleEnroll() {
    setError(null)
    start(async () => {
      const res = await enrollSelf(courseId)
      if (res.error) {
        setError(res.error === 'Already enrolled' ? 'You are already enrolled.' : res.error)
      } else {
        router.push(`/courses/${courseId}/learn`)
        router.refresh()
      }
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleEnroll}
        disabled={pending}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
        aria-label="Enroll in this course"
      >
        {pending ? 'Enrolling…' : "Enroll Now — It's Free"}
      </button>
      {error && <p className="text-sm text-rose-600 mt-2" role="alert">{error}</p>}
    </div>
  )
}
