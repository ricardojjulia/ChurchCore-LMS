'use client'

import { Calendar, Video, MapPin, Download, Clock } from 'lucide-react'
import { downloadIcs, type CalendarEventInput } from '@/lib/calendar-ics'

export interface LiveScheduleItem {
  id:              string
  section_code:    string
  delivery_format: string
  rrule:           string | null
  start_time:      string | null
  end_time:        string | null
  timezone:        string
  effective_from:  string
  effective_until: string | null
  location_type:   string | null
  location_detail: string | null
}

interface Props {
  courseTitle: string
  schedules:   LiveScheduleItem[]
}

export default function LiveMeetingCard({ courseTitle, schedules }: Props) {
  if (!schedules || schedules.length === 0) return null

  function handleExportCalendar(item: LiveScheduleItem) {
    const startDate = new Date(item.effective_from)
    const endDate = item.effective_until ? new Date(item.effective_until) : new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000)

    if (item.start_time) {
      const [sh, sm] = item.start_time.split(':').map(Number)
      startDate.setHours(sh || 19, sm || 0, 0, 0)
    }
    if (item.end_time) {
      const [eh, em] = item.end_time.split(':').map(Number)
      endDate.setHours(eh || 20, em || 30, 0, 0)
    } else {
      endDate.setHours(startDate.getHours() + 1, startDate.getMinutes() + 30, 0, 0)
    }

    const event: CalendarEventInput = {
      title:       `${courseTitle} — Live Class (${item.section_code})`,
      description: `Scheduled meeting for ${courseTitle}.\nCadence: ${item.rrule || 'Class Session'}\nFormat: ${item.delivery_format}`,
      location:    item.location_detail || (item.location_type === 'virtual' ? 'Virtual Meeting' : 'Campus Room'),
      startDate,
      endDate,
      url:         item.location_detail?.startsWith('http') ? item.location_detail : undefined,
    }

    downloadIcs(`${courseTitle.replace(/\s+/g, '_')}_Schedule.ics`, [event])
  }

  return (
    <section className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 sm:p-7 shadow-lg mb-8 border border-indigo-800/40">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-indigo-800/60">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm text-indigo-300">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Live Classroom & Virtual Sessions
            </h2>
            <p className="text-xs text-indigo-200 mt-0.5">
              Scheduled synchronous and hybrid sessions for this course
            </p>
          </div>
        </div>

        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 self-start sm:self-auto">
          Synchronous / Hybrid
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {schedules.map((s) => (
          <div
            key={s.id}
            className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-sm hover:bg-white/10 transition-colors"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-white">
                  {s.rrule || 'Scheduled Live Session'}
                </span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-400/20 text-indigo-200 font-semibold border border-indigo-400/30">
                  {s.section_code}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-indigo-200 flex-wrap">
                {s.start_time && (
                  <span className="flex items-center gap-1 text-indigo-100 font-medium">
                    <Clock className="h-3.5 w-3.5 text-indigo-400" />
                    {s.start_time.slice(0, 5)} {s.end_time ? `– ${s.end_time.slice(0, 5)}` : ''} ({s.timezone})
                  </span>
                )}

                <span>
                  📅 {new Date(s.effective_from).toLocaleDateString()}
                  {s.effective_until ? ` – ${new Date(s.effective_until).toLocaleDateString()}` : ''}
                </span>
              </div>

              {s.location_detail && (
                <div className="pt-1 flex items-center gap-2 text-xs">
                  {s.location_type === 'physical' ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-300 font-medium">
                      <MapPin className="h-3.5 w-3.5" />
                      Location: {s.location_detail}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sky-300 font-medium">
                      <Video className="h-3.5 w-3.5" />
                      Virtual Room: {s.location_detail.startsWith('http') ? (
                        <a
                          href={s.location_detail}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-white"
                        >
                          Join Meeting ↗
                        </a>
                      ) : (
                        s.location_detail
                      )}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
              {s.location_detail?.startsWith('http') && (
                <a
                  href={s.location_detail}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs transition-colors shadow-sm"
                >
                  <Video className="h-3.5 w-3.5" />
                  Join Live Room
                </a>
              )}
              <button
                type="button"
                onClick={() => handleExportCalendar(s)}
                className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-colors border border-white/20"
              >
                <Download className="h-3.5 w-3.5 text-indigo-300" />
                Add to Calendar (.ics)
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
