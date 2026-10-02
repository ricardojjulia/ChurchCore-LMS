'use client'

import { useState, useTransition } from 'react'
import { addAutoEnrollCourse, removeAutoEnrollCourse } from '@/app/actions/org-settings'

const AUTO_ENROLL_MAX = 10

interface CourseOption {
  id:    string
  title: string
}

export default function AutoEnrollSection({
  orgId,
  courses,
  initialSelectedIds,
}: {
  orgId:              string
  courses:            CourseOption[]
  initialSelectedIds: string[]
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds)
  const [error, setError]             = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()

  const atCap = selectedIds.length >= AUTO_ENROLL_MAX

  function toggle(courseId: string, checked: boolean) {
    setError(null)
    const previous = selectedIds

    if (checked) {
      if (atCap) {
        setError(`You can auto-enroll at most ${AUTO_ENROLL_MAX} courses.`)
        return
      }
      setSelectedIds([...previous, courseId])
    } else {
      setSelectedIds(previous.filter((id) => id !== courseId))
    }

    startTransition(async () => {
      try {
        const result = checked
          ? await addAutoEnrollCourse(orgId, courseId)
          : await removeAutoEnrollCourse(orgId, courseId)

        if (result.error) {
          setSelectedIds(previous) // rollback on failure
          setError(result.error)
        }
      } catch {
        // A rejected Server Action (e.g. an expired session throwing inside
        // assertOrgAdminOrPlatformAdmin()) must roll back the optimistic
        // update too, not just a returned {error}.
        setSelectedIds(previous)
        setError('Something went wrong. Please try again.')
      }
    })
  }

  return (
    <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-white">Auto-enroll new joiners</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Students who register via your join link are enrolled automatically in the courses checked below.
          Gated courses (invite-only, cohort, prerequisite, or age-restricted) are skipped silently. Up to {AUTO_ENROLL_MAX} courses.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400 bg-red-950/50 border border-red-800/80 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {courses.length === 0 ? (
        <p className="text-sm text-slate-400">No published courses yet.</p>
      ) : (
        <div className="divide-y divide-slate-800">
          {courses.map((course) => {
            const checked  = selectedIds.includes(course.id)
            const disabled = isPending || (!checked && atCap)
            return (
              <label
                key={course.id}
                className={`flex items-center justify-between gap-4 py-2.5 ${disabled && !checked ? 'opacity-50' : ''}`}
              >
                <span className="text-sm text-slate-200">{course.title}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(e) => toggle(course.id, e.target.checked)}
                  aria-label={`Auto-enroll new joiners in ${course.title}`}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-400"
                />
              </label>
            )
          })}
        </div>
      )}
    </section>
  )
}
