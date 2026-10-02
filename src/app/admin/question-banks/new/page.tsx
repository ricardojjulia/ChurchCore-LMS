import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import NewQuestionBankForm from './NewQuestionBankForm'

export default async function NewQuestionBankPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pr } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!pr || !['admin', 'manager'].includes(pr.role)) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-2xl mx-auto">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/admin/question-banks" className="hover:text-amber-300 font-medium">Question Banks</Link>
          <span className="text-slate-600">/</span>
          <span className="text-white font-semibold">New</span>
        </nav>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-extrabold text-white mb-2">New Question Bank</h1>
          <p className="text-sm text-slate-400 mb-6">
            A reusable pool of questions that can be drawn randomly into any quiz.
          </p>
          <NewQuestionBankForm />
        </div>
      </div>
    </main>
  )
}
