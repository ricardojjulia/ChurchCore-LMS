'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createAnnouncement } from '@/app/actions/announcements'
import { cn } from '@/lib/utils'

type Priority = 'low' | 'normal' | 'high' | 'urgent'
type Scope    = 'global' | 'course' | 'role'

interface Course { id: string; title: string }

interface Props { courses: Course[]; canPostOrgWide: boolean }

const PRIORITIES: { value: Priority; label: string; className: string }[] = [
  { value: 'low',    label: 'Low',    className: 'border-slate-700 text-slate-300 bg-slate-800' },
  { value: 'normal', label: 'Normal', className: 'border-sky-800 text-sky-400 bg-sky-950/50' },
  { value: 'high',   label: 'High',   className: 'border-amber-800 text-amber-400 bg-amber-950/50' },
  { value: 'urgent', label: 'Urgent', className: 'border-rose-800 text-rose-400 bg-rose-950/50' },
]

export default function NewAnnouncementForm({ courses, canPostOrgWide }: Props) {
  const router      = useRouter()
  const [title, setTitle]             = useState('')
  const [body, setBody]               = useState('')
  const [priority, setPriority]       = useState<Priority>('normal')
  // Non-admins can only post to a course, so don't preselect an audience they can't use.
  const [scope, setScope]             = useState<Scope>(canPostOrgWide ? 'global' : 'course')
  const [courseId, setCourseId]       = useState('')
  const [scheduled, setScheduled]     = useState(false)
  const [scheduledFor, setScheduledFor] = useState('')
  const [error, setError]             = useState<string | null>(null)
  const [isPending, start]            = useTransition()

  async function handle(publish: boolean, useSchedule = false) {
    setError(null)
    if (useSchedule && !scheduledFor) { setError('Pick a date and time to schedule.'); return }
    if (scope === 'course' && !courseId) { setError('Select a course for course-scoped announcements.'); return }
    const publishAt = useSchedule ? new Date(scheduledFor).toISOString() : undefined
    start(async () => {
      const res = await createAnnouncement({
        title, body, priority, scope,
        courseId: scope === 'course' ? courseId : undefined,
        publish, publishAt,
      })
      if (res.error) { setError(res.error); return }
      router.push('/announcements')
    })
  }

  return (
    <main className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">New Announcement</h1>
          <p className="text-sm text-slate-400 mt-1">
            Compose and post an announcement to your community.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-sm">
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-1">
              Title <span className="text-rose-400">*</span>
            </label>
            <input aria-label="Title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Announcement title…"
              className="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-1">
              Message <span className="text-rose-400">*</span>
            </label>
            <textarea aria-label="Message"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={5000}
              placeholder="Write your announcement…"
              className="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <p className="text-xs text-slate-400 mt-1 text-right">{body.length}/5000</p>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2">Priority</label>
            <div className="flex gap-2 flex-wrap">
              {PRIORITIES.map(({ value, label, className }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriority(value)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all',
                    priority === value
                      ? cn(className, 'ring-2 ring-offset-1 ring-offset-slate-900 ring-current')
                      : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2">Audience</label>
            <div className="flex gap-2 flex-wrap">
              {(['global', 'course', 'role'] as Scope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setScope(s); setCourseId('') }}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-lg border capitalize transition-all',
                    scope === s
                      ? 'bg-indigo-950/60 text-indigo-400 border-indigo-700'
                      : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
                  )}
                >
                  {s === 'global' ? 'Everyone' : s === 'course' ? 'Course members' : 'By role'}
                </button>
              ))}
            </div>

            {scope === 'global' && (
              <p className="text-xs text-slate-400 mt-1.5">Visible to all authenticated users.</p>
            )}
            {scope === 'role' && (
              <p className="text-xs text-slate-400 mt-1.5">Admin only: visible to all users with a specific role.</p>
            )}
            {scope === 'course' && (
              <div className="mt-2">
                <label htmlFor="course-select" className="block text-xs font-medium text-slate-300 mb-1">
                  Course <span className="text-rose-400">*</span>
                </label>
                {courses.length === 0 ? (
                  <p className="text-xs text-slate-400">No published courses available.</p>
                ) : (
                  <select
                    id="course-select"
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    className="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="" className="bg-slate-800 text-slate-300">Select a course…</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id} className="bg-slate-800 text-white">{c.title}</option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-slate-400 mt-1">Visible only to students enrolled in this course.</p>
              </div>
            )}
          </div>

          {/* Schedule option */}
          <div className="border border-slate-800 rounded-xl px-4 py-3 space-y-3 bg-slate-950/40">
            <button
              type="button"
              onClick={() => setScheduled((s) => !s)}
              className="flex items-center gap-2 text-sm font-semibold text-white"
            >
              <span
                className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center text-xs',
                  scheduled ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 bg-slate-800'
                )}
              >
                {scheduled && '✓'}
              </span>
              Schedule for later
            </button>
            {scheduled && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Publish at
                </label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  title="Scheduled publish date and time"
                  aria-label="Scheduled publish date and time"
                  className="border border-slate-700 rounded-lg px-3 py-2 text-sm bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Audience won't see the announcement until this date and time.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-rose-400 bg-rose-950/50 border border-rose-800/80 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
              disabled={isPending}
              className="text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending || !title.trim() || !body.trim()}
              onClick={() => handle(false)}
              className="border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
            >
              Save Draft
            </Button>
            {scheduled ? (
              <Button
                type="button"
                disabled={isPending || !title.trim() || !body.trim() || !scheduledFor}
                onClick={() => handle(true, true)}
                className="bg-amber-600 hover:bg-amber-500 text-white"
              >
                {isPending ? 'Scheduling…' : 'Schedule'}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={isPending || !title.trim() || !body.trim()}
                onClick={() => handle(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {isPending ? 'Publishing…' : 'Publish Now'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
