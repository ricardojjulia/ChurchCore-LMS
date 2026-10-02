import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import CalendarEventForm from './CalendarEventForm'

export const dynamic = 'force-dynamic'

export default async function NewCalendarEventPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date: initialDate } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/login')

  const isStaff = ['admin', 'manager', 'teacher'].includes(profile.role)
  const { data: courses } = await supabase
    .from('courses')
    .select('id, title')
    .order('title')

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-2xl mx-auto">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/calendar" className="hover:text-indigo-400 transition-colors font-medium">Calendar</Link>
          <span className="text-slate-600">/</span>
          <span className="text-white font-semibold">New Event</span>
        </nav>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-sm">
          <h1 className="text-2xl font-extrabold text-white mb-6">New Calendar Event</h1>
          <CalendarEventForm
            courses={(courses ?? []) as { id: string; title: string }[]}
            initialDate={initialDate}
            isStaff={isStaff}
          />
        </div>
      </div>
    </main>
  )
}
