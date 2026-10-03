import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import SectionForm from './SectionForm'

export default async function NewSectionPage({
  searchParams,
}: {
  searchParams: Promise<{ blueprint?: string }>
}) {
  const { blueprint: initialBlueprintId = '' } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('auth_id', user.id).single()
  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const [{ data: blueprints }, { data: terms }] = await Promise.all([
    supabase.from('course_blueprints').select('id, title, course_code').eq('is_active', true).order('title'),
    supabase.from('academic_terms').select('id, term_name, term_code').eq('is_active', true).order('start_date', { ascending: false }),
  ])

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-2xl mx-auto">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/admin/sections" className="hover:text-white font-medium transition-colors">Sections</Link>
          <span>/</span>
          <span className="text-white font-semibold">New</span>
        </nav>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-extrabold text-white mb-2">New Section</h1>
          <p className="text-sm text-slate-400 mb-6">
            A section is a scheduled instance of a blueprint within a term.
          </p>
          <SectionForm blueprints={blueprints ?? []} terms={terms ?? []} initialBlueprintId={initialBlueprintId} />
        </div>
      </div>
    </main>
  )
}
