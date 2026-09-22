'use client'

// COUNCIL-2026-029: Learning Paths / Discipleship Tracks — admin course list with reorder

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { removeCourseFromPath, reorderPathCourses } from '@/app/actions/learning-paths'
import type { LearningPathCourse } from '@/types/learning-path'

interface Props {
  pathId: string
  initialCourses: LearningPathCourse[]
}

export default function PathCourseList({ pathId, initialCourses }: Props) {
  const [courses, setCourses] = useState<LearningPathCourse[]>(
    [...initialCourses].sort((a, b) => a.sort_order - b.sort_order)
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function move(index: number, direction: 'up' | 'down') {
    const next = [...courses]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= next.length) return
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
    setCourses(next)

    startTransition(async () => {
      const result = await reorderPathCourses(pathId, next.map((c) => c.course_id))
      if (result.error) {
        setError(result.error)
        setCourses(courses) // revert
      }
    })
  }

  async function remove(courseId: string) {
    startTransition(async () => {
      const result = await removeCourseFromPath(pathId, courseId)
      if (result.error) {
        setError(result.error)
      } else {
        setCourses((prev) => prev.filter((c) => c.course_id !== courseId))
      }
    })
  }

  if (courses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No courses in this path yet. Add a published course below.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      {courses.map((lpc, index) => (
        <div
          key={lpc.course_id}
          className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
        >
          <span className="text-sm font-medium text-muted-foreground w-6 shrink-0 text-center">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{lpc.course.title}</p>
            <Badge variant="outline" className="text-xs mt-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">
              Published
            </Badge>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending || index === 0}
              onClick={() => move(index, 'up')}
              aria-label={`Move ${lpc.course.title} up`}
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending || index === courses.length - 1}
              onClick={() => move(index, 'down')}
              aria-label={`Move ${lpc.course.title} down`}
            >
              ↓
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={isPending}
              onClick={() => remove(lpc.course_id)}
              aria-label={`Remove ${lpc.course.title} from path`}
            >
              ✕
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
