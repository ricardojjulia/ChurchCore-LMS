import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import TermForm from '../new/TermForm'

export const dynamic = 'force-dynamic'

export default async function EditTermPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: termId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('auth_id', user.id).single()
  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const [{ data: term }, { data: parentTerms }] = await Promise.all([
    supabase.from('academic_terms')
      .select('id, term_name, term_code, type, start_date, end_date, parent_term_id, config, is_active')
      .eq('id', termId).single(),
    supabase.from('academic_terms')
      .select('id, term_name, term_code')
      .eq('is_active', true)
      .neq('id', termId)
      .order('term_name'),
  ])

  if (!term) notFound()

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/admin/terms" className="hover:text-primary font-medium">Terms</Link>
          <span>/</span>
          <span className="text-foreground font-semibold">{term.term_name}</span>
        </nav>
        <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-extrabold text-foreground mb-6">Edit Term</h1>
          <TermForm
            mode="edit"
            termId={termId}
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
