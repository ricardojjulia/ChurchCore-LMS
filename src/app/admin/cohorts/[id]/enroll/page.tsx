import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import EnrollWizard from './EnrollWizard'

export const dynamic = 'force-dynamic'

export default async function CohortEnrollPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: cohortId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const [cohortResult, sectionsResult, memberCountResult] = await Promise.all([
    supabase
      .from('global_cohorts')
      .select('id, cohort_name, cohort_code')
      .eq('id', cohortId)
      .single(),
    supabase
      .from('course_sections')
      .select(`
        id, section_code, delivery_format, is_active,
        course_blueprints ( id, title, course_code )
      `)
      .eq('is_active', true)
      .order('section_code'),
    supabase
      .from('cohort_members')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', cohortId)
      .eq('status', 'active'),
  ])

  const cohort = cohortResult.data
  if (!cohort) redirect('/admin/cohorts')

  const sections     = sectionsResult.data ?? []
  const memberCount  = memberCountResult.count ?? 0

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/admin/cohorts" className="hover:text-primary font-medium">Cohorts</Link>
          <span>/</span>
          <Link href={`/admin/cohorts/${cohortId}`} className="hover:text-primary font-medium">{cohort.cohort_name}</Link>
          <span>/</span>
          <span className="text-foreground font-semibold">Enroll in Section</span>
        </nav>

        <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-extrabold text-foreground mb-1">Enroll Cohort in Section</h1>
          <p className="text-sm text-muted-foreground mb-6">
            <strong className="text-foreground">{cohort.cohort_name}</strong> — {memberCount} active member{memberCount !== 1 ? 's' : ''}
          </p>

          <EnrollWizard
            cohortId={cohortId}
            memberCount={memberCount}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase select shape doesn't match EnrollWizard prop type
            sections={sections as any}
          />
        </div>
      </div>
    </main>
  )
}
