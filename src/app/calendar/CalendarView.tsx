'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CalEvent {
  source_id:   string
  event_type:  string
  title:       string
  description: string | null
  starts_at:   string
  ends_at:     string | null
  is_all_day:  boolean
  color_code:  string
  course_name: string | null
  location:    string | null
  scope:       string
}

const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS   = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']

function startOfMonth(y: number, m: number) { return new Date(y, m, 1) }
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function today() { return isoDate(new Date()) }

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function groupByDate(events: CalEvent[]): Record<string, CalEvent[]> {
  const out: Record<string, CalEvent[]> = {}
  for (const ev of events) {
    const k = ev.starts_at.slice(0, 10)
    ;(out[k] ??= []).push(ev)
  }
  return out
}

export default function CalendarView({
  initialEvents,
  isStaff,
}: {
  initialEvents: CalEvent[]
  isStaff:       boolean
}) {
  const now  = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [events, setEvents]         = useState<CalEvent[]>(initialEvents)
  const [selected, setSelected]     = useState<string | null>(today())
  const [, startFetch]              = useTransition()

  const fetchMonth = useCallback((y: number, m: number) => {
    const from = new Date(y, m, 1).toISOString()
    const to   = new Date(y, m + 1, 0, 23, 59, 59).toISOString()
    startFetch(async () => {
      const res = await fetch(`/api/calendar?from=${from}&to=${to}`)
      if (res.ok) setEvents(await res.json())
    })
  }, [])

  function prevMonth() {
    const y = month === 0 ? year - 1 : year
    const m = month === 0 ? 11 : month - 1
    setYear(y); setMonth(m); fetchMonth(y, m)
  }
  function nextMonth() {
    const y = month === 11 ? year + 1 : year
    const m = month === 11 ? 0 : month + 1
    setYear(y); setMonth(m); fetchMonth(y, m)
  }

  const byDate  = groupByDate(events)
  const firstDay = startOfMonth(year, month).getDay()
  const totalDays = daysInMonth(year, month)
  const todayStr  = today()

  // Build calendar grid (6 rows × 7 cols)
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedEvents = selected ? (byDate[selected] ?? []) : []

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Month grid */}
      <div className="flex-1 bg-white border border-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <h2 className="font-bold text-foreground">
            {MONTHS[month]} {year}
          </h2>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} className="h-16 border-b border-r border-border/40 last:border-r-0" />

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayEvents = byDate[dateStr] ?? []
            const isToday   = dateStr === todayStr
            const isSel     = dateStr === selected

            return (
              <button
                key={dateStr}
                onClick={() => setSelected(dateStr)}
                className={cn(
                  'h-16 border-b border-r border-border/40 last:border-r-0 p-1.5 text-left',
                  'hover:bg-slate-50 transition-colors relative group',
                  isSel && 'bg-primary/5 hover:bg-primary/10'
                )}
              >
                <span className={cn(
                  'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full',
                  isToday && 'bg-primary text-primary-foreground',
                  !isToday && isSel && 'text-primary',
                  !isToday && !isSel && 'text-foreground'
                )}>
                  {day}
                </span>

                {/* Event dots */}
                {dayEvents.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 flex-wrap">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <span
                        key={ev.source_id}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: ev.color_code }}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Day detail panel */}
      <div className="lg:w-80 flex flex-col gap-4">
        {/* Selected day events */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-bold text-foreground text-sm">
              {selected
                ? new Date(selected + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })
                : 'Select a day'}
            </h3>
            {isStaff && selected && (
              <a
                href={`/calendar/new?date=${selected}`}
                className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
              >
                <Plus className="w-3 h-3" /> Add
              </a>
            )}
          </div>

          {selectedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 italic">
              No events on this day.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {selectedEvents.map((ev) => (
                <div key={ev.source_id} className="px-4 py-3 flex items-start gap-3">
                  <span
                    className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: ev.color_code }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground leading-snug">{ev.title}</p>
                    {ev.course_name && (
                      <p className="text-xs text-primary mt-0.5">{ev.course_name}</p>
                    )}
                    {ev.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ev.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {ev.is_all_day ? 'All day' : formatTime(ev.starts_at)}
                      {ev.location && ` · ${ev.location}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming this month */}
        {Object.keys(byDate).filter((d) => d >= todayStr).length > 0 && (
          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="font-bold text-foreground text-sm">Upcoming This Month</h3>
            </div>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {Object.entries(byDate)
                .filter(([d]) => d >= todayStr)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(0, 10)
                .map(([date, evs]) => (
                  <button
                    key={date}
                    onClick={() => setSelected(date)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-8 text-center shrink-0">
                      <p className="text-xs text-muted-foreground">{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}</p>
                      <p className="text-sm font-bold text-foreground leading-tight">
                        {new Date(date + 'T12:00:00').getDate()}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{evs[0].title}</p>
                      {evs.length > 1 && (
                        <p className="text-xs text-muted-foreground">+{evs.length - 1} more</p>
                      )}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
