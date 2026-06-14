import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import CalendarView from './CalendarView'

export const dynamic = 'force-dynamic'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()
  if (!profile) redirect('/login')

  const isStaff = ['admin', 'teacher', 'manager'].includes(profile.role)

  // Prefetch current month events
  const now  = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

  const { data: events } = await supabase
    .from('v_unified_calendar')
    .select('source_id, event_type, title, description, starts_at, ends_at, is_all_day, color_code, course_name, location, scope')
    .gte('starts_at', from)
    .lte('starts_at', to)
    .order('starts_at', { ascending: true })

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Calendar</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your schedule at a glance.</p>
          </div>
          {isStaff && (
            <Link
              href="/calendar/new"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              + Add Event
            </Link>
          )}
        </div>

        <CalendarView
          initialEvents={(events ?? []) as any}
          isStaff={isStaff}
        />
      </div>
    </main>
  )
}
