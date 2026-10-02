import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import GroupsPanel from './GroupsPanel'
import SectionEnrollmentTypeForm from './SectionEnrollmentTypeForm'
import MeetingSchedulePanel from '@/components/academic/MeetingSchedulePanel'
import { Database } from 'lucide-react'

const ENROLLMENT_TYPE_BADGE: Record<string, { label: string; className: string }> = {
  open:          { label: 'Open Enrollment',  className: 'bg-emerald-950/50 text-emerald-400 border-emerald-800' },
  cohort_gated:  { label: 'Cohort Required',  className: 'bg-amber-950/50  text-amber-400  border-amber-800'  },
  invite_only:   { label: 'Invite Only',       className: 'bg-rose-950/50   text-rose-400   border-rose-800'   },
}

export const dynamic = 'force-dynamic'

export default async function SectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: sectionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!me || !['admin', 'manager', 'teacher'].includes(me.role)) redirect('/dashboard')

  const [sectionResult, groupsResult, managedLinkResult, schedulesResult] = await Promise.all([
    supabase
      .from('course_sections')
      .select(`
        id, section_code, delivery_format, is_active, max_enrollment,
        enrollment_open_date, enrollment_close_date, enrollment_type, blueprint_id,
        course_blueprints ( id, title, course_code ),
        academic_terms ( term_name, term_code, start_date, end_date )
      `)
      .eq('id', sectionId)
      .single(),
    supabase
      .from('section_groups')
      .select(`
        id, group_name, group_code, purpose, max_members, created_at,
        section_group_members ( id, user_id, role )
      `)
      .eq('section_id', sectionId)
      .order('group_name'),
    supabase
      .from('external_entity_links')
      .select('source_system')
      .eq('local_table', 'course_sections')
      .eq('local_id', sectionId)
      .eq('managed_by_external_system', true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('meeting_schedules')
      .select('*')
      .eq('section_id', sectionId)
      .order('effective_from', { ascending: true }),
  ])

  const section = sectionResult.data
  if (!section) redirect('/admin/sections')

  // Find linked courses that use this blueprint
  const { data: linkedCourses } = section.blueprint_id
    ? await supabase
        .from('courses')
        .select('id, title')
        .eq('blueprint_id', section.blueprint_id)
        .order('title')
    : { data: [] }

  const blueprint = section.course_blueprints as unknown as { id: string; title: string; course_code: string } | null
  const term      = section.academic_terms    as unknown as { term_name: string; term_code: string; start_date: string; end_date: string } | null
  const groups    = groupsResult.data ?? []
  const schedules = schedulesResult.data ?? []

  const totalMembers = groups.reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested join not narrowed
    (s, g) => s + ((g.section_group_members as any[])?.length ?? 0), 0
  )

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-5xl mx-auto space-y-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-400">
          <Link href="/admin/sections" className="hover:text-amber-300 font-medium">Sections</Link>
          <span>/</span>
          <span className="text-white font-semibold">{section.section_code}</span>
        </nav>

        {/* Section header */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                {blueprint?.course_code}
              </p>
              <h1 className="text-2xl font-extrabold text-white">{blueprint?.title ?? 'Section'}</h1>
              <p className="text-sm text-slate-400 mt-0.5 font-mono">{section.section_code}</p>
              {term && (
                <p className="text-sm text-slate-400 mt-2">
                  {term.term_name} · {new Date(term.start_date).toLocaleDateString(undefined, { timeZone: 'UTC' })} – {new Date(term.end_date).toLocaleDateString(undefined, { timeZone: 'UTC' })}
                </p>
              )}
              <div className="flex gap-6 mt-4 text-sm text-slate-400">
                <span><strong className="text-white">{groups.length}</strong> groups</span>
                <span><strong className="text-white">{totalMembers}</strong> group assignments</span>
                {section.max_enrollment && (
                  <span>Cap: <strong className="text-white">{section.max_enrollment}</strong></span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
              {managedLinkResult.data && (
                <span className="flex items-center gap-1.5 rounded-md border border-sky-800 bg-sky-950/50 px-2.5 py-1.5 text-xs font-bold uppercase text-sky-300">
                  <Database className="h-3.5 w-3.5" aria-hidden="true" />
                  OneRoster managed
                </span>
              )}
              {blueprint?.id && (
                <Link
                  href={`/courses/${blueprint.id}/tutor?section=${sectionId}`}
                  className="text-sm font-semibold text-violet-300 bg-violet-950/60 border border-violet-800 px-3 py-1.5 rounded-xl hover:bg-violet-900/60 transition-colors"
                >
                  Preview AI Tutor →
                </Link>
              )}
              <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border ${
                section.is_active
                  ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {section.delivery_format}
              </span>
              {(() => {
                const enrollBadge = ENROLLMENT_TYPE_BADGE[section.enrollment_type ?? 'open']
                  ?? ENROLLMENT_TYPE_BADGE.open
                return (
                  <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border ${enrollBadge.className}`}>
                    {enrollBadge.label}
                  </span>
                )
              })()}
            </div>
          </div>
        </div>

        {/* Groups management */}
        <GroupsPanel
          sectionId={sectionId}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase select shape doesn't match GroupsPanel prop type
          initialGroups={groups as any}
          isAdmin={['admin', 'manager'].includes(me.role)}
        />

        {/* Meeting Schedule & Live Hybrid Sessions */}
        <MeetingSchedulePanel
          sectionId={sectionId}
          deliveryFormat={section.delivery_format}
          schedules={schedules}
          linkedCourses={linkedCourses ?? []}
        />

        {/* Enrollment type settings (admin/manager only) */}
        {['admin', 'manager'].includes(me.role) && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-sm">
            <h2 className="text-lg font-bold text-white mb-1">Enrollment Settings</h2>
            <p className="text-sm text-slate-400 mb-6">
              Control who can enroll in this section. Changes take effect immediately for new enrollments.
            </p>
            <SectionEnrollmentTypeForm
              sectionId={sectionId}
              currentType={section.enrollment_type ?? 'open'}
            />
          </div>
        )}
      </div>
    </main>
  )
}
