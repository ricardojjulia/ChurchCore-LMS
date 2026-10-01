'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Plus, Trash2, Video, MapPin, Sparkles, Clock, Globe } from 'lucide-react'
import {
  createMeetingSchedule,
  deleteMeetingSchedule,
  generateAttendanceFromSchedule,
} from '@/app/actions/academic'

export interface MeetingSchedule {
  id:              string
  section_id:      string
  rrule:           string | null
  start_time:      string | null
  end_time:        string | null
  timezone:        string
  effective_from:  string
  effective_until: string | null
  location_type:   string | null
  location_detail: string | null
}

interface LinkedCourse {
  id:    string
  title: string
}

interface Props {
  sectionId:      string
  deliveryFormat: string
  schedules:      MeetingSchedule[]
  linkedCourses:  LinkedCourse[]
}

export default function MeetingSchedulePanel({
  sectionId,
  deliveryFormat,
  schedules,
  linkedCourses,
}: Props) {
  const router = useRouter()
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedCourseId, setSelectedCourseId] = useState(linkedCourses[0]?.id || '')
  const [pending, startTransition] = useTransition()
  const [generating, startGenerating] = useTransition()

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createMeetingSchedule(sectionId, fd)
      if (res.error) {
        setError(res.error)
      } else {
        setShowAddForm(false)
        setSuccess('Meeting schedule added successfully.')
        router.refresh()
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this meeting schedule?')) return
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await deleteMeetingSchedule(id, sectionId)
      if (res.error) {
        setError(res.error)
      } else {
        setSuccess('Schedule deleted.')
        router.refresh()
      }
    })
  }

  function handleGenerateAttendance() {
    if (!selectedCourseId) {
      setError('Please select a linked course to generate attendance sessions for.')
      return
    }
    setError(null)
    setSuccess(null)
    startGenerating(async () => {
      const res = await generateAttendanceFromSchedule({
        sectionId,
        courseId: selectedCourseId,
      })
      if (res.error) {
        setError(res.error)
      } else {
        setSuccess(`Successfully generated ${res.count} attendance sessions in course!`)
        router.refresh()
      }
    })
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Meeting Schedule & Hybrid Live Sessions
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure live classroom or Zoom session cadence ({deliveryFormat} format).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-bold px-3.5 py-2 rounded-xl text-xs hover:bg-primary/90 transition-colors self-start sm:self-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          {showAddForm ? 'Cancel' : 'Add Meeting Schedule'}
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-3 leading-relaxed">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 leading-relaxed">
          {success}
        </div>
      )}

      {/* Add Schedule Form */}
      {showAddForm && (
        <form onSubmit={handleCreate} className="bg-slate-50 border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">New Meeting Cadence</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Recurrence Cadence
              </label>
              <input
                type="text"
                name="rrule"
                placeholder="e.g. Every Tuesday & Thursday, Weekly on Wednesdays"
                className="input w-full text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  name="start_time"
                  className="input w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  name="end_time"
                  className="input w-full text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Effective From <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                name="effective_from"
                className="input w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Effective Until
              </label>
              <input
                type="date"
                name="effective_until"
                className="input w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Location Type
              </label>
              <select name="location_type" className="input w-full text-xs">
                <option value="virtual">Virtual (Zoom / Meet / Teams)</option>
                <option value="physical">Physical Classroom / Sanctuary</option>
                <option value="both">Hybrid (Both Virtual & In-Person)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Location Details / URL
              </label>
              <input
                type="text"
                name="location_detail"
                placeholder="e.g. https://zoom.us/j/123456 or Room 204"
                className="input w-full text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs font-semibold text-muted-foreground border border-border bg-white rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        </form>
      )}

      {/* Schedules List */}
      {schedules.length === 0 ? (
        <div className="text-center py-8 px-4 bg-slate-50/60 border border-dashed border-border rounded-xl">
          <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs font-semibold text-foreground">No meeting schedules configured</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Add recurring class times and locations for hybrid or synchronous delivery.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/40"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-xs text-foreground">
                    {s.rrule || 'Scheduled Meeting'}
                  </span>
                  {s.start_time && (
                    <span className="text-xs font-mono text-muted-foreground bg-white border border-border px-2 py-0.5 rounded">
                      {s.start_time.slice(0, 5)} {s.end_time ? `– ${s.end_time.slice(0, 5)}` : ''} {s.timezone}
                    </span>
                  )}
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                    {s.location_type || 'virtual'}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-0.5">
                  <span>
                    📅 {new Date(s.effective_from).toLocaleDateString()}
                    {s.effective_until ? ` – ${new Date(s.effective_until).toLocaleDateString()}` : ' (ongoing)'}
                  </span>

                  {s.location_detail && (
                    <span className="inline-flex items-center gap-1 text-foreground font-medium">
                      {s.location_type === 'physical' ? (
                        <MapPin className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Video className="h-3 w-3 text-sky-600" />
                      )}
                      {s.location_detail.startsWith('http') ? (
                        <a
                          href={s.location_detail}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Join Meeting Link ↗
                        </a>
                      ) : (
                        s.location_detail
                      )}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                disabled={pending}
                className="text-xs text-rose-600 hover:text-rose-800 p-1.5 rounded hover:bg-rose-50 transition-colors self-end sm:self-auto"
                title="Delete Schedule"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          {/* Quick Generate Attendance in Course */}
          {linkedCourses.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
              <div>
                <p className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                  Auto-Generate Attendance Blocks
                </p>
                <p className="text-[11px] text-indigo-800/80 mt-0.5">
                  Populate attendance check-in blocks in the course builder for all scheduled dates.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {linkedCourses.length > 1 && (
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="input text-xs py-1.5"
                  >
                    {linkedCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  disabled={generating || schedules.length === 0}
                  onClick={handleGenerateAttendance}
                  className="bg-indigo-600 text-white font-bold text-xs px-3.5 py-2 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 whitespace-nowrap shadow-sm"
                >
                  {generating ? 'Generating…' : 'Generate Sessions'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
