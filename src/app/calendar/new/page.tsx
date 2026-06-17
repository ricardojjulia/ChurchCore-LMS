import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import CalendarEventForm from './CalendarEventForm'

export const dynamic = 'force-dynamic'

export default async function NewCalendarEventPage({
  searchParams,
}: {
  searchParams?: { date?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  const isStaff = ['admin', 'manager', 'teacher'].includes(profile.role)
  const { data: courses } = await supabase
    .from('courses')
    .select('id, title')
    .order('title')

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/calendar" className="hover:text-primary font-medium">Calendar</Link>
          <span>/</span>
          <span className="text-foreground font-semibold">New Event</span>
        </nav>
        <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-extrabold text-foreground mb-6">New Calendar Event</h1>
          <CalendarEventForm
            courses={(courses ?? []) as { id: string; title: string }[]}
            initialDate={searchParams?.date}
            isStaff={isStaff}
          />
        </div>
      </div>
    </main>
  )
}
