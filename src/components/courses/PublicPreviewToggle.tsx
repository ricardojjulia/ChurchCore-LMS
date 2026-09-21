'use client'

import { useState, useTransition } from 'react'
import { setCoursePublicPreview } from '@/app/actions/org-settings'

export default function PublicPreviewToggle({
  courseId,
  initialValue,
  courseStatus,
}: {
  courseId:     string
  initialValue: boolean
  courseStatus: string
}) {
  const [enabled, setEnabled]        = useState(initialValue)
  const [error, setError]            = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isPublished = courseStatus === 'published'

  function handleChange(checked: boolean) {
    setError(null)
    const previous = enabled
    setEnabled(checked)

    startTransition(async () => {
      try {
        const result = await setCoursePublicPreview(courseId, checked)

        if (result.error) {
          setEnabled(previous) // rollback on server-returned error
          setError(result.error)
        }
      } catch {
        // A rejected Server Action (e.g. an expired session throwing inside
        // assertOrgAdminOrPlatformAdmin()) must roll back the optimistic
        // update too, not just a returned {error}.
        setEnabled(previous)
        setError('Something went wrong. Please try again.')
      }
    })
  }

  return (
    <section className="bg-white rounded-xl border p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Public preview</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          When enabled, this course is visible to unauthenticated visitors at your
          org&apos;s public catalog URL. Visitors see the course title, description,
          and curriculum outline (lesson titles only) — never lesson content.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!isPublished && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Publish this course first before enabling public preview.
        </p>
      )}

      <label
        className={`flex items-center justify-between gap-4 py-1 ${
          !isPublished || isPending ? 'opacity-50' : ''
        }`}
      >
        <span className="text-sm text-slate-700">Allow public preview</span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!isPublished || isPending}
          onChange={(e) => handleChange(e.target.checked)}
          aria-label="Allow public preview of this course"
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
        />
      </label>
    </section>
  )
}
