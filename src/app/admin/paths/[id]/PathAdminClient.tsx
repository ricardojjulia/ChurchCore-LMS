'use client'

// COUNCIL-2026-029: Admin — client-side path management

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import PathCourseList from '@/components/lms/PathCourseList'
import {
  updateLearningPath,
  deleteLearningPath,
  addCourseToPath,
} from '@/app/actions/learning-paths'
import type { LearningPathWithCourses, LearningPathCourse } from '@/types/learning-path'

interface Props {
  path: LearningPathWithCourses
  addableCourses: Array<{ id: string; title: string }>
}

export default function PathAdminClient({ path, addableCourses }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [title, setTitle] = useState(path.title)
  const [description, setDescription] = useState(path.description ?? '')
  const [isPublished, setIsPublished] = useState(path.is_published)
  const [selectedCourseId, setSelectedCourseId] = useState('')

  function handleSave() {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await updateLearningPath(path.id, {
        title,
        description: description.trim() || null,
        is_published: isPublished,
      })
      if (result.error) setError(result.error)
      else setSuccess('Saved')
    })
  }

  function handleDelete() {
    if (!confirm('Delete this learning path? This cannot be undone.')) return
    startTransition(async () => {
      const result = await deleteLearningPath(path.id)
      if (result.error) setError(result.error)
      else router.push('/admin/paths')
    })
  }

  function handleAddCourse() {
    if (!selectedCourseId) return
    setError(null)
    startTransition(async () => {
      const result = await addCourseToPath(path.id, selectedCourseId)
      if (result.error) setError(result.error)
      else {
        setSelectedCourseId('')
        router.refresh()
      }
    })
  }

  const courses = [...(path.learning_path_courses as LearningPathCourse[])].sort(
    (a, b) => a.sort_order - b.sort_order
  )

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <a href="/admin/paths" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
          ← Learning Paths
        </a>
        <h1 className="text-2xl font-bold">Edit Learning Path</h1>
      </div>

      {/* Path details form */}
      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-lg">Details</h2>

        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1">
            Title <span className="text-destructive">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="is_published"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="h-4 w-4"
          />
          <label htmlFor="is_published" className="text-sm">
            Published{' '}
            <span className="text-muted-foreground">(visible to learners)</span>
          </label>
          {isPublished && (
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
              Live
            </Badge>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{success}</p>}

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
          <Button variant="outline" onClick={handleDelete} disabled={isPending} className="text-destructive border-destructive hover:bg-destructive/10">
            Delete path
          </Button>
        </div>
      </section>

      {/* Course management */}
      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-lg">Courses</h2>
        <p className="text-sm text-muted-foreground">
          Use the ↑↓ buttons to reorder. Only published courses can be added.
        </p>

        <PathCourseList pathId={path.id} initialCourses={courses} />

        {addableCourses.length > 0 && (
          <div className="flex gap-2 items-center pt-2 border-t">
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a course to add…</option>
              {addableCourses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            <Button
              onClick={handleAddCourse}
              disabled={isPending || !selectedCourseId}
              variant="outline"
            >
              Add
            </Button>
          </div>
        )}
        {addableCourses.length === 0 && courses.length > 0 && (
          <p className="text-sm text-muted-foreground italic pt-2 border-t">
            All published courses are already in this path.
          </p>
        )}
        {addableCourses.length === 0 && courses.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No published courses available. Publish a course first.
          </p>
        )}
      </section>

      <p className="text-sm">
        <a href={`/paths/${path.id}`} className="text-primary hover:underline">
          View as learner →
        </a>
      </p>
    </main>
  )
}
