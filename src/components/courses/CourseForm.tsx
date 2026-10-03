'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { createCourse } from '@/app/actions/courses'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import BlueprintSelector from '@/components/courses/BlueprintSelector'

type CourseStatus = 'draft' | 'published' | 'archived' | 'suspended'

interface ExistingCourse {
  id: string
  title: string
}

type ProgramTrack = { name: string; code: string }

interface Blueprint {
  id:             string
  title:          string
  course_code?:   string | null
  program_tracks?: ProgramTrack | ProgramTrack[] | null
}

interface Props {
  userId: string
  existingCourses: ExistingCourse[]
  blueprints?: Blueprint[]
  courseId?: string
  initialTitle?: string
  initialDescription?: string
  initialLevel?: number
  initialPrerequisiteId?: string | null
  initialStatus?: CourseStatus
  initialBlueprintId?: string | null
  initialAgeMin?: number | null
  initialAgeMax?: number | null
}

const STATUS_CONFIG: Record<CourseStatus, { label: string; active: string }> = {
  draft:     { label: 'Draft',     active: 'bg-amber-950/60 border-amber-800/60 text-amber-300' },
  published: { label: 'Published', active: 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300' },
  archived:  { label: 'Archived',  active: 'bg-slate-800 border-slate-700 text-slate-300' },
  suspended: { label: 'Suspended', active: 'bg-rose-950/60 border-rose-800/60 text-rose-300' },
}

const STATUS_DESCRIPTIONS: Record<CourseStatus, string> = {
  published: 'Visible to eligible students.',
  archived:  'Hidden from students. Content preserved.',
  suspended: 'Temporarily unavailable to enrolled students.',
  draft:     'Draft — only visible to you.',
}

export default function CourseForm({
  userId: _userId,
  existingCourses,
  blueprints = [],
  courseId,
  initialTitle = '',
  initialDescription = '',
  initialLevel = 1,
  initialPrerequisiteId = null,
  initialStatus = 'draft',
  initialBlueprintId = null,
  initialAgeMin = null,
  initialAgeMax = null,
}: Props) {
  const isEdit = !!courseId

  const [title, setTitle]               = useState(initialTitle)
  const [description, setDescription]   = useState(initialDescription)
  const [minLevel, setMinLevel]         = useState(initialLevel)
  const [prerequisiteId, setPrerequisiteId] = useState(initialPrerequisiteId ?? '')
  const [blueprintId, setBlueprintId]   = useState<string | null>(initialBlueprintId)
  const [status, setStatus]             = useState<CourseStatus>(initialStatus)
  const [ageMin, setAgeMin]             = useState<string>(initialAgeMin != null ? String(initialAgeMin) : '')
  const [ageMax, setAgeMax]             = useState<string>(initialAgeMax != null ? String(initialAgeMax) : '')
  const [saving, setSaving]             = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const ageMinVal = ageMin !== '' ? Number(ageMin) : null
    const ageMaxVal = ageMax !== '' ? Number(ageMax) : null

    if (ageMinVal !== null && ageMaxVal !== null && ageMinVal > ageMaxVal) {
      setError('Min Age cannot be greater than Max Age.')
      setSaving(false)
      return
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      min_required_level: minLevel,
      prerequisite_course_id: prerequisiteId || null,
      blueprint_id: blueprintId || null,
      status,
      age_min: ageMinVal,
      age_max: ageMaxVal,
    }

    if (isEdit) {
      const { error: updateError } = await supabase
        .from('courses')
        .update(payload)
        .eq('id', courseId)

      setSaving(false)
      if (updateError) { setError(updateError.message); return }
      router.push(`/courses/${courseId}`)
      router.refresh()
    } else {
      const result = await createCourse(payload)

      setSaving(false)
      if (result.error) { setError(result.error); return }
      router.push(`/courses/${result.id}`)
      router.refresh()
    }
  }

  async function handleDelete() {
    if (!courseId) return
    setDeleting(true)
    setError(null)
    const supabase = createClient()
    const { error: deleteError } = await supabase.from('courses').delete().eq('id', courseId)
    if (deleteError) { setDeleting(false); setConfirmingDelete(false); setError(deleteError.message); return }
    router.push('/courses')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title */}
      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-1">
          Title <span className="text-destructive">*</span>
        </label>
        <input aria-label="Title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Introduction to Biblical Studies"
          required
          className="w-full border border-slate-700 rounded-md px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-1">
          Description
          <span className="ml-2 text-xs font-normal text-slate-400">(optional)</span>
        </label>
        <textarea aria-label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What will students learn in this course?"
          rows={4}
          className="w-full border border-slate-700 rounded-md px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none"
        />
      </div>

      {/* Academic placement */}
      <section className="border border-slate-800 rounded-xl p-5 bg-slate-900/60 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-white">Academic Placement</h2>
          <p className="text-xs text-slate-400 mt-1">
            Courses attach to blueprints. Tracks are assigned on the blueprint; terms and sections are assigned when you create a section.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-1" htmlFor="course_blueprint">
            Course Blueprint
            <span className="ml-2 text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <BlueprintSelector
            id="course_blueprint"
            blueprints={blueprints}
            value={blueprintId}
            onChange={setBlueprintId}
            disabled={saving}
          />
          <p className="text-xs text-slate-400 mt-1">
            Section enrollment uses this blueprint to connect students to this course.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href="/admin/program-tracks/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-slate-300 border border-slate-800 bg-slate-900 rounded-xl px-3 py-1.5 hover:bg-slate-800 hover:text-white transition-all shadow-sm flex items-center gap-1.5"
          >
            <span>Create Program Track</span>
            <span className="text-[10px] text-slate-500" aria-hidden="true">↗</span>
          </Link>
          <Link
            href="/admin/blueprints/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-slate-300 border border-slate-800 bg-slate-900 rounded-xl px-3 py-1.5 hover:bg-slate-800 hover:text-white transition-all shadow-sm flex items-center gap-1.5"
          >
            <span>Create Blueprint</span>
            <span className="text-[10px] text-slate-500" aria-hidden="true">↗</span>
          </Link>
          <Link
            href="/admin/terms/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-slate-300 border border-slate-800 bg-slate-900 rounded-xl px-3 py-1.5 hover:bg-slate-800 hover:text-white transition-all shadow-sm flex items-center gap-1.5"
          >
            <span>Create Term</span>
            <span className="text-[10px] text-slate-500" aria-hidden="true">↗</span>
          </Link>
          <Link
            href={blueprintId ? `/admin/sections/new?blueprint=${blueprintId}` : '/admin/sections/new'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-slate-300 border border-slate-800 bg-slate-900 rounded-xl px-3 py-1.5 hover:bg-slate-800 hover:text-white transition-all shadow-sm flex items-center gap-1.5"
          >
            <span>Create Section</span>
            <span className="text-[10px] text-slate-500" aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      {/* Min Level + Prerequisite */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-1">Minimum Level</label>
          <input aria-label="Minimum Level"
            type="number" min={1} max={100} value={minLevel} title="Minimum level required"
            onChange={(e) => setMinLevel(Number(e.target.value))}
            className="w-full border border-slate-700 rounded-md px-4 py-2.5 text-sm text-slate-100 bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          />
          <p className="text-xs text-slate-400 mt-1">Students must be at least this level.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-1">Prerequisite Course</label>
          <select aria-label="Prerequisite Course"
            value={prerequisiteId}
            onChange={(e) => setPrerequisiteId(e.target.value)}
            title="Prerequisite course"
            className="w-full border border-slate-700 rounded-md px-4 py-2.5 text-sm text-slate-100 bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          >
            <option value="">None</option>
            {existingCourses
              .filter((c) => c.id !== courseId)
              .map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">Student must pass this course first (≥ 80%).</p>
        </div>
      </div>

      {/* Age Restriction */}
      <div>
        <p className="text-sm font-semibold text-slate-200 mb-1">
          Age Restriction
          <span className="ml-2 text-xs font-normal text-slate-400">(optional)</span>
        </p>
        <p className="text-xs text-slate-400 mb-3">
          Students outside this age range will be blocked from enrolling. Leave blank for no restriction.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="age_min" className="block text-sm font-medium text-slate-200 mb-1">Min Age</label>
            <input
              id="age_min"
              type="number"
              min={0}
              max={120}
              value={ageMin}
              placeholder="No minimum"
              onChange={(e) => setAgeMin(e.target.value)}
              className="w-full border border-slate-700 rounded-md px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>
          <div>
            <label htmlFor="age_max" className="block text-sm font-medium text-slate-200 mb-1">Max Age</label>
            <input
              id="age_max"
              type="number"
              min={0}
              max={120}
              value={ageMax}
              placeholder="No maximum"
              onChange={(e) => setAgeMax(e.target.value)}
              className="w-full border border-slate-700 rounded-md px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-200">Status</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(STATUS_CONFIG) as CourseStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'py-2.5 px-3 rounded-lg border text-sm font-semibold transition-all',
                status === s
                  ? STATUS_CONFIG[s].active
                  : 'border-slate-800 text-slate-400 bg-slate-900/60 hover:border-slate-700 hover:text-slate-200'
              )}
            >
              {STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">{STATUS_DESCRIPTIONS[status]}</p>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        {isEdit ? (
          confirmingDelete ? (
            <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 px-3 py-1.5 rounded-lg">
              <span className="text-xs text-destructive font-medium">Delete course?</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving}
            >
              Delete Course
            </Button>
          )
        ) : <span />}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Course'}
          </Button>
        </div>
      </div>
    </form>
  )
}
