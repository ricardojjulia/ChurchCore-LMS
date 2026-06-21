import nextDynamic from 'next/dynamic'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { createServerClient } from '@/lib/supabase/server'
import ReportsDrawer from '@/components/reports/ReportsDrawer'
import { ReportsNav } from './ReportsNav'

export const metadata: Metadata = {
  title: 'Reports | ChurchCore LMS',
}

export const dynamic = 'force-dynamic'

type ReportRole = 'student' | 'instructor' | 'admin'

type Profile = {
  uid: string
  role: string
  org_id: string | null
  display_name: string | null
}

type ReportsContextValue = {
  role: ReportRole
  profile: Profile
}

const navByRole: Record<ReportRole, Array<{ href: string; label: string }>> = {
  student: [
    { href: '/student/reports', label: 'My Progress' },
    { href: '/student/reports#certificates', label: 'My Certificates' },
    { href: '/student/reports#download', label: 'Download Report' },
  ],
  instructor: [
    { href: '/instructor/reports', label: 'Gradebook' },
    { href: '/instructor/reports#completion', label: 'Course Completion' },
    { href: '/instructor/reports#analytics', label: 'Analytics' },
    { href: '/instructor/reports#export', label: 'Export' },
  ],
  admin: [
    { href: '/admin/reports', label: 'Overview' },
    { href: '/admin/reports#courses', label: 'Courses' },
    { href: '/admin/reports#users', label: 'Users' },
    { href: '/admin/reports#audit-log', label: 'Audit Log' },
    { href: '/admin/reports#export', label: 'Export' },
  ],
}

function normalizeRole(role: string): ReportRole {
  if (role === 'admin') return 'admin'
  if (role === 'teacher' || role === 'manager' || role === 'instructor') return 'instructor'
  return 'student'
}

function routeRole(pathname: string): ReportRole | null {
  if (pathname.startsWith('/admin/reports')) return 'admin'
  if (pathname.startsWith('/instructor/reports')) return 'instructor'
  if (pathname.startsWith('/student/reports')) return 'student'
  return null
}

function ForbiddenReports({ expectedRole, actualRole }: { expectedRole: ReportRole; actualRole: ReportRole }) {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">403</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Reports access denied</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This report area is for {expectedRole} users. Your current reporting role is {actualRole}.
        </p>
      </div>
    </main>
  )
}

function ReportsSidebarShell({ context }: { context: ReportsContextValue }) {
  return (
    <aside className="border-r border-slate-200 bg-white px-5 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reports</p>
        <p className="mt-1 text-lg font-bold text-slate-950">ChurchCore LMS</p>
      </div>
      <ReportsNav links={navByRole[context.role]} ariaLabel={`${context.role} reports`} />
    </aside>
  )
}

const ReportsSidebar = nextDynamic(() => Promise.resolve(ReportsSidebarShell))

export default async function ReportsLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role, org_id, display_name')
    .eq('auth_id', user.id)
    .single<Profile>()

  if (!profile) redirect('/onboarding')

  const role = normalizeRole(profile.role)
  const pathname = (await headers()).get('x-pathname') ?? ''
  const expectedRole = routeRole(pathname)
  const reportsContext: ReportsContextValue = { role, profile }

  if (expectedRole && expectedRole !== role) {
    return <ForbiddenReports expectedRole={expectedRole} actualRole={role} />
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 lg:grid lg:grid-cols-[280px_1fr]">
      <ReportsSidebar context={reportsContext} />
      <section className="min-w-0 px-4 py-8 sm:px-6 lg:px-10">
        <div className="mb-6 flex justify-end">
          <ReportsDrawer />
        </div>
        {children}
      </section>
    </div>
  )
}
