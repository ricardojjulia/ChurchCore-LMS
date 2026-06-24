'use client'

import { useTransition } from 'react'
import { removeCourseFromTrack } from '@/app/actions/program-tracks'

interface TrackCourse {
  course_id: string
  sequence_order: number
  is_required: boolean
  courses: {
    id: string
    title: string
    status: string
  } | null
}

interface Props {
  trackId: string
  trackCourses: TrackCourse[]
}

const STATUS_CLASSES: Record<string, string> = {
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft:     'bg-amber-50 text-amber-700 border-amber-200',
  archived:  'bg-slate-100 text-slate-500 border-slate-200',
}

export default function TrackCourseList({ trackId, trackCourses }: Props) {
  const [pending, startTransition] = useTransition()

  function handleRemove(courseId: string) {
    startTransition(async () => {
      await removeCourseFromTrack(trackId, courseId)
    })
  }

  if (trackCourses.length === 0) {
    return (
      <div className="bg-white border border-border rounded-xl p-8 text-center">
        <p className="text-muted-foreground text-sm italic">
          No courses added to this track yet.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-border">
          <tr>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground w-12">#</th>
            <th className="text-left px-6 py-3 font-semibold text-muted-foreground">Course</th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Type</th>
            <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {trackCourses.map((tc) => {
            const statusClass =
              STATUS_CLASSES[tc.courses?.status ?? ''] ??
              'bg-slate-100 text-slate-500 border-slate-200'

            return (
              <tr key={tc.course_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-4 text-center font-mono text-muted-foreground text-xs">
                  {tc.sequence_order}
                </td>
                <td className="px-6 py-4">
                  <p className="font-semibold text-foreground">
                    {tc.courses?.title ?? 'Unknown course'}
                  </p>
                </td>
                <td className="px-4 py-4 text-center">
                  <span
                    className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border ${statusClass}`}
                  >
                    {tc.courses?.status ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  {tc.is_required ? (
                    <span
                      aria-label="Required"
                      title="Required"
                      className="inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200"
                    >
                      Required
                    </span>
                  ) : (
                    <span
                      aria-label="Optional"
                      title="Optional"
                      className="inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200"
                    >
                      Optional
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => handleRemove(tc.course_id)}
                    disabled={pending}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold disabled:opacity-40 transition-colors"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
