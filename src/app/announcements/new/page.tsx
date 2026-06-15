'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createAnnouncement } from '@/app/actions/announcements'
import { cn } from '@/lib/utils'

type Priority = 'low' | 'normal' | 'high' | 'urgent'
type Scope    = 'global' | 'course' | 'role'

const PRIORITIES: { value: Priority; label: string; className: string }[] = [
  { value: 'low',    label: 'Low',    className: 'border-slate-200 text-slate-600 bg-slate-50' },
  { value: 'normal', label: 'Normal', className: 'border-sky-200 text-sky-700 bg-sky-50' },
  { value: 'high',   label: 'High',   className: 'border-amber-200 text-amber-700 bg-amber-50' },
  { value: 'urgent', label: 'Urgent', className: 'border-rose-200 text-rose-700 bg-rose-50' },
]

export default function NewAnnouncementPage() {
  const router      = useRouter()
  const [title, setTitle]       = useState('')
  const [body, setBody]         = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [scope, setScope]       = useState<Scope>('global')
  const [scheduled,   setScheduled]   = useState(false)
  const [scheduledFor, setScheduledFor] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [isPending, start]      = useTransition()

  async function handle(publish: boolean, useSchedule = false) {
    setError(null)
    if (useSchedule && !scheduledFor) { setError('Pick a date and time to schedule.'); return }
    const publishAt = useSchedule ? new Date(scheduledFor).toISOString() : undefined
    start(async () => {
      const res = await createAnnouncement({ title, body, priority, scope, publish, publishAt })
      if (res.error) { setError(res.error); return }
      router.push('/announcements')
    })
  }

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">New Announcement</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compose and post an announcement to your community.
          </p>
        </div>

        <div className="bg-white border border-border rounded-2xl p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Announcement title…"
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Message <span className="text-destructive">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={5000}
              placeholder="Write your announcement…"
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">{body.length}/5000</p>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Priority</label>
            <div className="flex gap-2 flex-wrap">
              {PRIORITIES.map(({ value, label, className }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriority(value)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all',
                    priority === value
                      ? cn(className, 'ring-2 ring-offset-1 ring-current')
                      : 'border-border text-muted-foreground hover:bg-slate-50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Audience</label>
            <div className="flex gap-2 flex-wrap">
              {(['global', 'course', 'role'] as Scope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-lg border capitalize transition-all',
                    scope === s
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'border-border text-muted-foreground hover:bg-slate-50'
                  )}
                >
                  {s === 'global' ? 'Everyone' : s === 'course' ? 'Course members' : 'By role'}
                </button>
              ))}
            </div>
            {scope === 'global' && (
              <p className="text-xs text-muted-foreground mt-1.5">Visible to all authenticated users.</p>
            )}
            {scope === 'course' && (
              <p className="text-xs text-amber-600 mt-1.5">Course selection coming soon — will be visible to all enrolled students.</p>
            )}
            {scope === 'role' && (
              <p className="text-xs text-muted-foreground mt-1.5">Admin only: visible to all users with a specific role.</p>
            )}
          </div>

          {/* Schedule option */}
          <div className="border border-border rounded-xl px-4 py-3 space-y-3">
            <button
              type="button"
              onClick={() => setScheduled((s) => !s)}
              className="flex items-center gap-2 text-sm font-semibold text-foreground"
            >
              <span
                className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center text-xs',
                  scheduled ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                )}
              >
                {scheduled && '✓'}
              </span>
              Schedule for later
            </button>
            {scheduled && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Publish at
                </label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  title="Scheduled publish date and time"
                  aria-label="Scheduled publish date and time"
                  className="border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Audience won't see the announcement until this date and time.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending || !title.trim() || !body.trim()}
              onClick={() => handle(false)}
            >
              Save Draft
            </Button>
            {scheduled ? (
              <Button
                type="button"
                disabled={isPending || !title.trim() || !body.trim() || !scheduledFor}
                onClick={() => handle(true, true)}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {isPending ? 'Scheduling…' : 'Schedule'}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={isPending || !title.trim() || !body.trim()}
                onClick={() => handle(true)}
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
