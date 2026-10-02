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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 text-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-400" />
            Meeting Schedule & Hybrid Live Sessions
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure live classroom or Zoom session cadence ({deliveryFormat} format).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-1.5 bg-indigo-600 text-white font-bold px-3.5 py-2 rounded-xl text-xs hover:bg-indigo-500 transition-colors self-start sm:self-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          {showAddForm ? 'Cancel' : 'Add Meeting Schedule'}
        </button>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-xl p-3 leading-relaxed">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs rounded-xl p-3 leading-relaxed">
          {success}
        </div>
      )}

      {/* Add Schedule Form */}
      {showAddForm && (
        <form onSubmit={handleCreate} className="bg-slate-950/50 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">New Meeting Cadence</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Recurrence Cadence
              </label>
              <input
                type="text"
                name="rrule"
                placeholder="e.g. Every Tuesday & Thursday, Weekly on Wednesdays"
                className="input w-full text-xs bg-slate-800 border-slate-700 text-white placeholder-slate-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  name="start_time"
                  className="input w-full text-xs bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  name="end_time"
                  className="input w-full text-xs bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Effective From <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                required
                name="effective_from"
                className="input w-full text-xs bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Effective Until
              </label>
              <input
                type="date"
                name="effective_until"
                className="input w-full text-xs bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Location Type
              </label>
              <select name="location_type" className="input w-full text-xs bg-slate-800 border-slate-700 text-white">
                <option value="virtual">Virtual (Zoom / Meet / Teams)</option>
                <option value="physical">Physical Classroom / Sanctuary</option>
                <option value="both">Hybrid (Both Virtual & In-Person)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Location Details / URL
              </label>
              <input
                type="text"
                name="location_detail"
                placeholder="e.g. https://zoom.us/j/123456 or Room 204"
                className="input w-full text-xs bg-slate-800 border-slate-700 text-white placeholder-slate-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-400 border border-slate-700 bg-slate-800 rounded-lg hover:bg-slate-700 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        </form>
      )}

      {/* Schedules List */}
      {schedules.length === 0 ? (
        <div className="text-center py-8 px-4 bg-slate-950/50 border border-dashed border-slate-800 rounded-xl">
          <Clock className="h-8 w-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs font-semibold text-white">No meeting schedules configured</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Add recurring class times and locations for hybrid or synchronous delivery.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-xs text-white">
                    {s.rrule || 'Scheduled Meeting'}
                  </span>
                  {s.start_time && (
                    <span className="text-xs font-mono text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">
                      {s.start_time.slice(0, 5)} {s.end_time ? `– ${s.end_time.slice(0, 5)}` : ''} {s.timezone}
                    </span>
                  )}
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-400 border border-indigo-800">
                    {s.location_type || 'virtual'}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap pt-0.5">
                  <span>
                    📅 {new Date(s.effective_from).toLocaleDateString()}
                    {s.effective_until ? ` – ${new Date(s.effective_until).toLocaleDateString()}` : ' (ongoing)'}
                  </span>

                  {s.location_detail && (
                    <span className="inline-flex items-center gap-1 text-slate-300 font-medium">
                      {s.location_type === 'physical' ? (
                        <MapPin className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Video className="h-3 w-3 text-sky-400" />
                      )}
                      {s.location_detail.startsWith('http') ? (
                        <a
                          href={s.location_detail}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-300 hover:underline"
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
                className="text-xs text-rose-400 hover:text-rose-300 p-1.5 rounded hover:bg-rose-950/40 transition-colors self-end sm:self-auto"
                title="Delete Schedule"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          {/* Quick Generate Attendance in Course */}
          {linkedCourses.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-950/30 border border-indigo-800/60 rounded-xl p-4">
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Auto-Generate Attendance Blocks
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Populate attendance check-in blocks in the course builder for all scheduled dates.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {linkedCourses.length > 1 && (
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="input text-xs py-1.5 bg-slate-800 border-slate-700 text-white"
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
                  className="bg-indigo-600 text-white font-bold text-xs px-3.5 py-2 rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-50 whitespace-nowrap shadow-sm"
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
