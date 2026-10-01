'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Calendar, Award } from 'lucide-react'
import { createQuickAttendanceSession } from '@/app/actions/attendance'

interface Props {
  courseId: string
}

export default function QuickSessionModal({ courseId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [points, setPoints] = useState('10')
  const [mode, setMode] = useState('both')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Session title is required.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await createQuickAttendanceSession({
        courseId,
        sessionTitle: title.trim(),
        pointsPossible: Number(points) || 0,
        trackingMode: mode,
      })

      if (res.error) {
        setError(res.error)
      } else {
        setOpen(false)
        setTitle('')
        router.refresh()
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-bold px-3.5 py-2 rounded-xl text-xs hover:bg-primary/90 transition-colors shadow-sm"
      >
        <Plus className="h-3.5 w-3.5" />
        + Quick Attendance Session
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <h2 className="font-bold text-base text-foreground">Add Attendance Session</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-3">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Session Title <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Week 1 Live Classroom, Oct 12 Session"
                  className="input w-full text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Points Possible
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                    className="input w-full text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5">0 = non-graded</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Tracking Mode
                  </label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    className="input w-full text-sm"
                  >
                    <option value="both">Auto + Manual</option>
                    <option value="manual">Manual Roll-Call Only</option>
                    <option value="auto">Auto-Checkin Only</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-border rounded-xl hover:bg-slate-50 text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {pending ? 'Adding…' : 'Create Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
