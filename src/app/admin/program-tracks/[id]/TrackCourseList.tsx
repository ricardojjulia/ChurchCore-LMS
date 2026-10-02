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
  published: 'bg-emerald-950/50 text-emerald-400 border-emerald-800',
  draft:     'bg-amber-950/50 text-amber-400 border-amber-800',
  archived:  'bg-slate-800 text-slate-400 border-slate-700',
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
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
        <p className="text-slate-400 text-sm italic">
          No courses added to this track yet.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-900/80 border-b border-slate-800">
          <tr>
            <th className="text-center px-4 py-3 font-semibold text-slate-300 w-12">#</th>
            <th className="text-left px-6 py-3 font-semibold text-slate-300">Course</th>
            <th className="text-center px-4 py-3 font-semibold text-slate-300">Status</th>
            <th className="text-center px-4 py-3 font-semibold text-slate-300">Type</th>
            <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {trackCourses.map((tc) => {
            const statusClass =
              STATUS_CLASSES[tc.courses?.status ?? ''] ??
              'bg-slate-800 text-slate-400 border-slate-700'

            return (
              <tr key={tc.course_id} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-4 text-center font-mono text-slate-400 text-xs">
                  {tc.sequence_order}
                </td>
                <td className="px-6 py-4">
                  <p className="font-semibold text-white">
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
                      className="inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border bg-indigo-950/50 text-indigo-400 border-indigo-800"
                    >
                      Required
                    </span>
                  ) : (
                    <span
                      aria-label="Optional"
                      title="Optional"
                      className="inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border bg-slate-800 text-slate-400 border-slate-700"
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
                    className="text-xs text-rose-400 hover:text-rose-300 font-semibold disabled:opacity-40 transition-colors"
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
