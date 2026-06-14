import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { Calendar } from 'lucide-react'

function formatDate(iso: string, tz = 'UTC'): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: tz,
  })
}

function formatTime(iso: string, tz = 'UTC'): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: tz,
  })
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const n = new Date()
  return d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
}

function isTomorrow(iso: string): boolean {
  const d = new Date(iso)
  const n = new Date()
  n.setDate(n.getDate() + 1)
  return d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
}

function dayLabel(iso: string): string {
  if (isToday(iso))    return 'Today'
  if (isTomorrow(iso)) return 'Tomorrow'
  return formatDate(iso)
}

export default async function DashboardUpcomingEvents({ isStaff }: { isStaff: boolean }) {
  const supabase = await createClient()

  const now  = new Date().toISOString()
  const week = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: events } = await supabase
    .from('v_unified_calendar')
    .select('source_id, event_type, title, starts_at, ends_at, is_all_day, color_code, course_name, location')
    .gte('starts_at', now)
    .lte('starts_at', week)
    .order('starts_at', { ascending: true })
    .limit(8)

  if (!events || events.length === 0) {
    return (
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            Upcoming
          </h2>
          <Link href="/calendar" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            View calendar
          </Link>
        </div>
        <div className="bg-white border border-border rounded-xl p-6 text-center">
          <p className="text-sm text-muted-foreground italic">Nothing scheduled in the next 7 days.</p>
          {isStaff && (
            <Link href="/calendar" className="text-xs text-primary mt-2 inline-block hover:underline">
              Add an event →
            </Link>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          Upcoming
        </h2>
        <Link href="/calendar" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View all →
        </Link>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden divide-y divide-border">
        {events.map((ev: any) => (
          <div key={ev.source_id} className="flex items-center gap-4 px-4 py-3">
            {/* Color dot */}
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: ev.color_code ?? '#6366F1' }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{ev.title}</p>
              <p className="text-xs text-muted-foreground">
                {ev.course_name && <span className="mr-1">{ev.course_name} ·</span>}
                {ev.location && <span className="mr-1">{ev.location} ·</span>}
                {ev.is_all_day ? 'All day' : formatTime(ev.starts_at)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-xs font-semibold ${isToday(ev.starts_at) ? 'text-rose-600' : isTomorrow(ev.starts_at) ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {dayLabel(ev.starts_at)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
