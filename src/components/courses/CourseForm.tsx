'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type CourseStatus = 'draft' | 'published' | 'archived' | 'suspended'

interface ExistingCourse {
  id: string
  title: string
}

interface Props {
  userId: string
  existingCourses: ExistingCourse[]
  courseId?: string
  initialTitle?: string
  initialDescription?: string
  initialLevel?: number
  initialPrerequisiteId?: string | null
  initialStatus?: CourseStatus
}

const STATUS_CONFIG: Record<CourseStatus, { label: string; active: string }> = {
  draft:     { label: 'Draft',     active: 'bg-amber-50 border-amber-400 text-amber-700' },
  published: { label: 'Published', active: 'bg-emerald-50 border-emerald-400 text-emerald-700' },
  archived:  { label: 'Archived',  active: 'bg-slate-100 border-slate-400 text-slate-600' },
  suspended: { label: 'Suspended', active: 'bg-rose-50 border-rose-400 text-rose-700' },
}

const STATUS_DESCRIPTIONS: Record<CourseStatus, string> = {
  published: 'Visible to eligible students.',
  archived:  'Hidden from students. Content preserved.',
  suspended: 'Temporarily unavailable to enrolled students.',
  draft:     'Draft — only visible to you.',
}

export default function CourseForm({
  userId,
  existingCourses,
  courseId,
  initialTitle = '',
  initialDescription = '',
  initialLevel = 1,
  initialPrerequisiteId = null,
  initialStatus = 'draft',
}: Props) {
  const isEdit = !!courseId

  const [title, setTitle]               = useState(initialTitle)
  const [description, setDescription]   = useState(initialDescription)
  const [minLevel, setMinLevel]         = useState(initialLevel)
  const [prerequisiteId, setPrerequisiteId] = useState(initialPrerequisiteId ?? '')
  const [status, setStatus]             = useState<CourseStatus>(initialStatus)
  const [saving, setSaving]             = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      min_required_level: minLevel,
      prerequisite_course_id: prerequisiteId || null,
      status,
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
      const { data, error: insertError } = await supabase
        .from('courses')
        .insert({ ...payload, owner_id: userId })
        .select('id')
        .single()

      setSaving(false)
      if (insertError) { setError(insertError.message); return }
      router.push(`/courses/${data.id}`)
      router.refresh()
    }
  }

  async function handleDelete() {
    if (!courseId) return
    if (!confirm('Permanently delete this course and all its content? This cannot be undone.')) return
    setDeleting(true)
    const supabase = createClient()
    const { error: deleteError } = await supabase.from('courses').delete().eq('id', courseId)
    if (deleteError) { setDeleting(false); setError(deleteError.message); return }
    router.push('/courses')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Title <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Introduction to Biblical Studies"
          required
          className="w-full border border-input rounded-md px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring transition"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Description
          <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What will students learn in this course?"
          rows={4}
          className="w-full border border-input rounded-md px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring transition resize-none"
        />
      </div>

      {/* Min Level + Prerequisite */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Minimum Level</label>
          <input
            type="number" min={1} max={100} value={minLevel} title="Minimum level required"
            onChange={(e) => setMinLevel(Number(e.target.value))}
            className="w-full border border-input rounded-md px-4 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
          <p className="text-xs text-muted-foreground mt-1">Students must be at least this level.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Prerequisite Course</label>
          <select
            value={prerequisiteId}
            onChange={(e) => setPrerequisiteId(e.target.value)}
            title="Prerequisite course"
            className="w-full border border-input rounded-md px-4 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring transition"
          >
            <option value="">None</option>
            {existingCourses
              .filter((c) => c.id !== courseId)
              .map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">Student must pass this course first (≥ 80%).</p>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">Status</p>
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
                  : 'border-border text-muted-foreground hover:border-slate-300'
              )}
            >
              {STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{STATUS_DESCRIPTIONS[status]}</p>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        {isEdit ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting || saving}
          >
            {deleting ? 'Deleting…' : 'Delete Course'}
          </Button>
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
