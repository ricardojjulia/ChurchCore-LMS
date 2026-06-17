'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createCalendarEvent } from '@/app/actions/announcements'

interface CourseOption {
  id: string
  title: string
}

export default function CalendarEventForm({
  courses,
  initialDate,
  isStaff,
}: {
  courses: CourseOption[]
  initialDate?: string
  isStaff: boolean
}) {
  const router = useRouter()
  const [scope, setScope] = useState<'personal' | 'course' | 'institutional'>(isStaff ? 'institutional' : 'personal')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const defaultStartsAt = useMemo(() => {
    const date = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : new Date().toISOString().slice(0, 10)
    return `${date}T18:00`
  }, [initialDate])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    const startsAt = String(form.get('starts_at') ?? '')
    const endsAt = String(form.get('ends_at') ?? '')
    const courseId = String(form.get('course_id') ?? '')

    start(async () => {
      const result = await createCalendarEvent({
        title: String(form.get('title') ?? ''),
        eventType: String(form.get('event_type') ?? 'custom'),
        startsAt: startsAt ? new Date(startsAt).toISOString() : '',
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        description: String(form.get('description') ?? ''),
        location: String(form.get('location') ?? ''),
        colorCode: String(form.get('color_code') ?? '#6366F1'),
        scope,
        courseId: scope === 'course' ? courseId : undefined,
      })

      if (result.error) {
        setError(result.error)
        return
      }
      router.push('/calendar')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-800 text-sm">{error}</div>}

      <div>
        <label htmlFor="title" className="block text-sm font-semibold text-foreground mb-1.5">Title</label>
        <input id="title" name="title" required className="input w-full" placeholder="e.g. Formation cohort check-in" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="starts_at" className="block text-sm font-semibold text-foreground mb-1.5">Starts</label>
          <input id="starts_at" name="starts_at" type="datetime-local" required defaultValue={defaultStartsAt} className="input w-full" />
        </div>
        <div>
          <label htmlFor="ends_at" className="block text-sm font-semibold text-foreground mb-1.5">Ends</label>
          <input id="ends_at" name="ends_at" type="datetime-local" className="input w-full" />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="scope" className="block text-sm font-semibold text-foreground mb-1.5">Scope</label>
          <select
            id="scope"
            name="scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as 'personal' | 'course' | 'institutional')}
            className="input w-full"
          >
            <option value="personal">Personal</option>
            <option value="course">Course</option>
            {isStaff && <option value="institutional">Institutional</option>}
          </select>
        </div>
        <div>
          <label htmlFor="event_type" className="block text-sm font-semibold text-foreground mb-1.5">Type</label>
          <select id="event_type" name="event_type" defaultValue="custom" className="input w-full">
            <option value="custom">Custom</option>
            <option value="assignment_due">Assignment due</option>
            <option value="course_start">Course start</option>
            <option value="course_end">Course end</option>
            <option value="exam">Exam</option>
            <option value="office_hours">Office hours</option>
            <option value="holiday">Holiday</option>
            <option value="institutional">Institutional</option>
          </select>
        </div>
      </div>

      {scope === 'course' && (
        <div>
          <label htmlFor="course_id" className="block text-sm font-semibold text-foreground mb-1.5">Course</label>
          <select id="course_id" name="course_id" required className="input w-full">
            <option value="">Select course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid sm:grid-cols-[1fr_auto] gap-4">
        <div>
          <label htmlFor="location" className="block text-sm font-semibold text-foreground mb-1.5">Location</label>
          <input id="location" name="location" className="input w-full" placeholder="Room, campus, or remote link" />
        </div>
        <div>
          <label htmlFor="color_code" className="block text-sm font-semibold text-foreground mb-1.5">Color</label>
          <input id="color_code" name="color_code" type="color" defaultValue="#6366F1" className="h-10 w-16 rounded-lg border border-border bg-white p-1" />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-semibold text-foreground mb-1.5">Description</label>
        <textarea id="description" name="description" rows={4} className="input w-full" placeholder="Optional notes for learners or staff." />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Link href="/calendar" className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted/40">
          Cancel
        </Link>
        <button disabled={pending} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-60">
          {pending ? 'Saving...' : 'Create Event'}
        </button>
      </div>
    </form>
  )
}
