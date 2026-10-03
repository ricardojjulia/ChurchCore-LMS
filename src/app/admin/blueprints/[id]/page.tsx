import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { BookOpen, Calendar, Plus, ExternalLink, Layers, GraduationCap } from 'lucide-react'
import BlueprintForm from '../new/BlueprintForm'

export const dynamic = 'force-dynamic'

const STATUS_BADGES: Record<string, string> = {
  published: 'bg-emerald-950/50 text-emerald-400 border-emerald-800',
  draft:     'bg-amber-950/50 text-amber-400 border-amber-800',
  archived:  'bg-slate-800 text-slate-400 border-slate-700',
  suspended: 'bg-rose-950/50 text-rose-400 border-rose-800',
}

const FORMAT_BADGES: Record<string, string> = {
  synchronous:  'bg-indigo-950/50 text-indigo-400 border-indigo-800',
  asynchronous: 'bg-emerald-950/50 text-emerald-400 border-emerald-800',
  hybrid:       'bg-amber-950/50 text-amber-400 border-amber-800',
  self_paced:   'bg-slate-800 text-slate-400 border-slate-700',
}

export default async function EditBlueprintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: blueprintId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('auth_id', user.id).single()
  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const [
    { data: bp },
    { data: tracks },
    { data: managedLink },
    { data: linkedCourses },
    { data: linkedSections },
  ] = await Promise.all([
    supabase.from('course_blueprints')
      .select('id, course_code, title, description, credits, program_track_id, is_active')
      .eq('id', blueprintId).single(),
    supabase.from('program_tracks').select('id, name, code').eq('is_active', true).order('name'),
    supabase.from('external_entity_links')
      .select('source_system')
      .eq('local_table', 'course_blueprints')
      .eq('local_id', blueprintId)
      .eq('managed_by_external_system', true)
      .limit(1)
      .maybeSingle(),
    supabase.from('courses')
      .select('id, title, status, created_at')
      .eq('blueprint_id', blueprintId)
      .order('created_at', { ascending: false }),
    supabase.from('course_sections')
      .select('id, section_code, delivery_format, is_active, max_enrollment, academic_terms(term_name, term_code)')
      .eq('blueprint_id', blueprintId)
      .order('created_at', { ascending: false }),
  ])

  if (!bp) notFound()

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Breadcrumb & Header */}
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-400 mb-4">
            <Link href="/admin/blueprints" className="hover:text-white font-medium transition-colors">Blueprints</Link>
            <span>/</span>
            <span className="text-white font-semibold">{bp.course_code}</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white">{bp.title}</h1>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{bp.course_code} • {bp.credits ?? 0} Credits</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Link
                href={`/courses/new?blueprint_id=${blueprintId}`}
                className="inline-flex items-center gap-1.5 bg-indigo-600 text-white font-bold px-3.5 py-2 rounded-xl text-xs hover:bg-indigo-500 transition-colors shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Course
              </Link>
              <Link
                href={`/admin/sections/new?blueprint=${blueprintId}`}
                className="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 text-slate-200 font-bold px-3.5 py-2 rounded-xl text-xs hover:bg-slate-700 transition-colors shadow-sm"
              >
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Schedule Section
              </Link>
            </div>
          </div>
        </div>

        {/* Blueprint Edit Form Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-white">Blueprint Specification</h2>
              <p className="text-xs text-slate-400 mt-0.5">Catalog parameters, credit hours, and academic track assignment.</p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${bp.is_active ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
              {bp.is_active ? 'Active' : 'Archived / Inactive'}
            </span>
          </div>

          <BlueprintForm
            mode="edit"
            blueprintId={blueprintId}
            managedSource={managedLink?.source_system ?? null}
            tracks={tracks ?? []}
            initial={{
              title:            bp.title,
              description:      bp.description,
              credits:          bp.credits,
              program_track_id: bp.program_track_id,
              is_active:        bp.is_active,
            }}
          />
        </div>

        {/* Connected Resources Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Linked Live Courses */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-indigo-400" />
                <h3 className="font-bold text-white text-sm">Linked Courses ({linkedCourses?.length ?? 0})</h3>
              </div>
              <Link
                href={`/courses/new?blueprint_id=${blueprintId}`}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:underline inline-flex items-center gap-1"
              >
                + Add Course
              </Link>
            </div>

            {(!linkedCourses || linkedCourses.length === 0) ? (
              <div className="text-center py-8 px-4 bg-slate-950/50 border border-dashed border-slate-800 rounded-xl">
                <Layers className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-400">No LMS courses linked yet.</p>
                <Link
                  href={`/courses/new?blueprint_id=${blueprintId}`}
                  className="mt-2 inline-block text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:underline"
                >
                  Create course from this blueprint →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {linkedCourses.map((c) => (
                  <div key={c.id} className="py-3 flex items-center justify-between text-sm">
                    <div className="min-w-0 pr-3">
                      <Link href={`/courses/${c.id}`} className="font-medium text-white hover:text-indigo-300 transition-colors truncate block">
                        {c.title}
                      </Link>
                      <span className="text-[11px] text-slate-400">
                        Created {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGES[c.status] ?? 'bg-slate-800 text-slate-400'}`}>
                        {c.status}
                      </span>
                      <Link href={`/courses/${c.id}`} className="text-slate-400 hover:text-white">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Scheduled Academic Sections */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-400" />
                <h3 className="font-bold text-white text-sm">Scheduled Sections ({linkedSections?.length ?? 0})</h3>
              </div>
              <Link
                href={`/admin/sections/new?blueprint=${blueprintId}`}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:underline inline-flex items-center gap-1"
              >
                + Schedule Section
              </Link>
            </div>

            {(!linkedSections || linkedSections.length === 0) ? (
              <div className="text-center py-8 px-4 bg-slate-950/50 border border-dashed border-slate-800 rounded-xl">
                <Calendar className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-400">No sections scheduled for this blueprint.</p>
                <Link
                  href={`/admin/sections/new?blueprint=${blueprintId}`}
                  className="mt-2 inline-block text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:underline"
                >
                  Schedule a term section →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {linkedSections.map((s) => {
                  const term = s.academic_terms as unknown as { term_name: string; term_code: string } | null
                  return (
                    <div key={s.id} className="py-3 flex items-center justify-between text-sm">
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-white">{s.section_code}</span>
                          {term && (
                            <span className="text-[11px] text-slate-400 font-medium">({term.term_name})</span>
                          )}
                        </div>
                        <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${FORMAT_BADGES[s.delivery_format] ?? 'bg-slate-800 text-slate-400'}`}>
                          {s.delivery_format}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.is_active ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                          {s.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <Link href={`/admin/sections/${s.id}`} className="text-slate-400 hover:text-white">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

