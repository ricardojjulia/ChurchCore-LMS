'use client'

import { useState, useTransition } from 'react'
import { addCourseToTrack } from '@/app/actions/program-tracks'

interface AvailableCourse {
  id: string
  title: string
  status: string
}

interface Props {
  trackId: string
  availableCourses: AvailableCourse[]
  nextSequenceOrder: number
}

export default function AddCourseToTrackForm({
  trackId,
  availableCourses,
  nextSequenceOrder,
}: Props) {
  const [courseId, setCourseId]         = useState('')
  const [sequenceOrder, setSequenceOrder] = useState(nextSequenceOrder)
  const [isRequired, setIsRequired]     = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [pending, startTransition]      = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!courseId) {
      setError('Please select a course.')
      return
    }

    startTransition(async () => {
      const result = await addCourseToTrack(trackId, courseId, sequenceOrder, isRequired)
      if (result.error) {
        setError(result.error)
        return
      }
      // Reset form after successful add; sequence order bumps by 1
      setCourseId('')
      setSequenceOrder((prev) => prev + 1)
      setIsRequired(true)
    })
  }

  if (availableCourses.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic">
        All org courses are already on this track.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="bg-rose-950/50 border border-rose-800 rounded-xl p-3 text-rose-300 text-sm"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
        {/* Course select */}
        <div>
          <label
            htmlFor="ptc-course"
            className="block text-xs font-semibold text-slate-200 mb-1.5"
          >
            Course <span className="text-rose-400">*</span>
          </label>
          <select
            id="ptc-course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            required
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select a course…</option>
            {availableCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.status !== 'published' ? ` (${c.status})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Sequence order */}
        <div>
          <label
            htmlFor="ptc-order"
            className="block text-xs font-semibold text-slate-200 mb-1.5"
          >
            Order
          </label>
          <input
            id="ptc-order"
            type="number"
            min={1}
            value={sequenceOrder}
            onChange={(e) => setSequenceOrder(Number(e.target.value))}
            className="w-20 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Required checkbox */}
        <div className="flex items-center gap-2 pb-0.5">
          <input
            id="ptc-required"
            type="checkbox"
            checked={isRequired}
            onChange={(e) => setIsRequired(e.target.checked)}
            className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="ptc-required" className="text-sm font-semibold text-slate-200 whitespace-nowrap">
            Required
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {pending ? 'Adding…' : 'Add Course'}
        </button>
      </div>
    </form>
  )
}
