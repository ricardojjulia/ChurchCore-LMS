import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import TermForm from '../new/TermForm'

export const dynamic = 'force-dynamic'

export default async function EditTermPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: termId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('auth_id', user.id).single()
  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const [{ data: term }, { data: parentTerms }, { data: managedLink }] = await Promise.all([
    supabase.from('academic_terms')
      .select('id, term_name, term_code, type, start_date, end_date, parent_term_id, config, is_active')
      .eq('id', termId).single(),
    supabase.from('academic_terms')
      .select('id, term_name, term_code')
      .eq('is_active', true)
      .neq('id', termId)
      .order('term_name'),
    supabase.from('external_entity_links')
      .select('source_system')
      .eq('local_table', 'academic_terms')
      .eq('local_id', termId)
      .eq('managed_by_external_system', true)
      .limit(1)
      .maybeSingle(),
  ])

  if (!term) notFound()

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/admin/terms" className="hover:text-primary font-medium">Terms</Link>
          <span>/</span>
          <span className="text-foreground font-semibold">{term.term_name}</span>
        </nav>
        <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-extrabold text-foreground mb-6">Edit Term</h1>
          <TermForm
            mode="edit"
            termId={termId}
            managedSource={managedLink?.source_system ?? null}
            parentTerms={parentTerms ?? []}
            initial={{
              term_name:      term.term_name,
              term_code:      term.term_code,
              type:           term.type,
              start_date:     term.start_date,
              end_date:       term.end_date,
              parent_term_id: term.parent_term_id,
              config:         (term.config as object) ?? {},
              is_active:      term.is_active,
            }}
          />
        </div>
      </div>
    </main>
  )
}
