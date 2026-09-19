'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations()
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
        <label htmlFor="title" className="block text-sm font-semibold text-foreground mb-1.5">{t('calendar.new.titleLabel')}</label>
        <input id="title" name="title" required className="input w-full" placeholder={t('calendar.new.titlePlaceholder')} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="starts_at" className="block text-sm font-semibold text-foreground mb-1.5">{t('calendar.new.startsLabel')}</label>
          <input id="starts_at" name="starts_at" type="datetime-local" required defaultValue={defaultStartsAt} className="input w-full" />
        </div>
        <div>
          <label htmlFor="ends_at" className="block text-sm font-semibold text-foreground mb-1.5">{t('calendar.new.endsLabel')}</label>
          <input id="ends_at" name="ends_at" type="datetime-local" className="input w-full" />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="scope" className="block text-sm font-semibold text-foreground mb-1.5">{t('calendar.new.scopeLabel')}</label>
          <select
            id="scope"
            name="scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as 'personal' | 'course' | 'institutional')}
            className="input w-full"
          >
            <option value="personal">{t('calendar.new.scopePersonal')}</option>
            <option value="course">{t('calendar.new.scopeCourse')}</option>
            {isStaff && <option value="institutional">{t('calendar.new.typeInstitutional')}</option>}
          </select>
        </div>
        <div>
          <label htmlFor="event_type" className="block text-sm font-semibold text-foreground mb-1.5">{t('calendar.new.typeLabel')}</label>
          <select id="event_type" name="event_type" defaultValue="custom" className="input w-full">
            <option value="custom">{t('calendar.new.typeCustom')}</option>
            <option value="assignment_due">{t('calendar.new.typeAssignmentDue')}</option>
            <option value="course_start">{t('calendar.new.typeCourseStart')}</option>
            <option value="course_end">{t('calendar.new.typeCourseEnd')}</option>
            <option value="exam">{t('calendar.new.typeExam')}</option>
            <option value="office_hours">{t('calendar.new.typeOfficeHours')}</option>
            <option value="holiday">{t('calendar.new.typeHoliday')}</option>
            <option value="institutional">{t('calendar.new.typeInstitutional')}</option>
          </select>
        </div>
      </div>

      {scope === 'course' && (
        <div>
          <label htmlFor="course_id" className="block text-sm font-semibold text-foreground mb-1.5">{t('calendar.new.courseFieldLabel')}</label>
          <select id="course_id" name="course_id" required className="input w-full">
            <option value="">{t('calendar.new.selectCoursePlaceholder')}</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid sm:grid-cols-[1fr_auto] gap-4">
        <div>
          <label htmlFor="location" className="block text-sm font-semibold text-foreground mb-1.5">{t('calendar.new.locationLabel')}</label>
          <input id="location" name="location" className="input w-full" placeholder={t('calendar.new.locationPlaceholder')} />
        </div>
        <div>
          <label htmlFor="color_code" className="block text-sm font-semibold text-foreground mb-1.5">{t('calendar.new.colorLabel')}</label>
          <input id="color_code" name="color_code" type="color" defaultValue="#6366F1" className="h-10 w-16 rounded-lg border border-border bg-white p-1" />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-semibold text-foreground mb-1.5">{t('calendar.new.descriptionLabel')}</label>
        <textarea id="description" name="description" rows={4} className="input w-full" placeholder={t('calendar.new.descriptionPlaceholder')} />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Link href="/calendar" className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted/40">
          {t('common.cancel')}
        </Link>
        <button disabled={pending} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-60">
          {pending ? t('common.savingButton') : t('calendar.new.createEventButton')}
        </button>
      </div>
    </form>
  )
}
