import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import GroupsPanel from './GroupsPanel'

export const dynamic = 'force-dynamic'

export default async function SectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: sectionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!me || !['admin', 'manager', 'teacher'].includes(me.role)) redirect('/dashboard')

  const [sectionResult, groupsResult] = await Promise.all([
    supabase
      .from('course_sections')
      .select(`
        id, section_code, delivery_format, is_active, max_enrollment,
        enrollment_open_date, enrollment_close_date,
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
  ])

  const section = sectionResult.data
  if (!section) redirect('/admin/sections')

  const blueprint = section.course_blueprints as unknown as { id: string; title: string; course_code: string } | null
  const term      = section.academic_terms    as unknown as { term_name: string; term_code: string; start_date: string; end_date: string } | null
  const groups    = groupsResult.data ?? []

  const totalMembers = groups.reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested join not narrowed
    (s, g) => s + ((g.section_group_members as any[])?.length ?? 0), 0
  )

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <nav className="flex items-center gap-2 text-sm text-slate-400">
          <Link href="/admin/sections" className="hover:text-primary font-medium">Sections</Link>
          <span>/</span>
          <span className="text-foreground font-semibold">{section.section_code}</span>
        </nav>

        {/* Section header */}
        <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
                {blueprint?.course_code}
              </p>
              <h1 className="text-2xl font-extrabold text-foreground">{blueprint?.title ?? 'Section'}</h1>
              <p className="text-sm text-muted-foreground mt-0.5 font-mono">{section.section_code}</p>
              {term && (
                <p className="text-sm text-muted-foreground mt-2">
                  {term.term_name} · {new Date(term.start_date).toLocaleDateString()} – {new Date(term.end_date).toLocaleDateString()}
                </p>
              )}
              <div className="flex gap-6 mt-4 text-sm text-muted-foreground">
                <span><strong className="text-foreground">{groups.length}</strong> groups</span>
                <span><strong className="text-foreground">{totalMembers}</strong> group assignments</span>
                {section.max_enrollment && (
                  <span>Cap: <strong className="text-foreground">{section.max_enrollment}</strong></span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {blueprint?.id && (
                <Link
                  href={`/courses/${blueprint.id}/tutor?section=${sectionId}`}
                  className="text-sm font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-xl hover:bg-violet-100 transition-colors"
                >
                  Preview AI Tutor →
                </Link>
              )}
              <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border ${
                section.is_active
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}>
                {section.delivery_format}
              </span>
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
      </div>
    </main>
  )
}
