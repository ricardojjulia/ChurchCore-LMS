import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import BankDetailClient from './BankDetailClient'

export const dynamic = 'force-dynamic'

interface BankQuestion {
  id:               string
  question_type:    string
  question_content: Record<string, unknown>
  created_at:       string
}

interface Bank {
  id:          string
  name:        string
  description: string | null
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function BankDetailPage({ params }: Props) {
  const { id } = await params
  const isNew = id === 'new'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: pr } = await supabase
    .from('profile_roles')
    .select('role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!pr || !['admin', 'manager'].includes(pr.role)) redirect('/dashboard')

  let bank: Bank | null = null
  let questions: BankQuestion[] = []

  if (!isNew) {
    const { data: b } = await supabase
      .from('question_banks')
      .select('id, name, description')
      .eq('id', id)
      .eq('org_id', pr.org_id)
      .single()

    if (!b) redirect('/admin/question-banks')
    bank = b

    const { data: qs } = await supabase
      .from('bank_questions')
      .select('id, question_type, question_content, created_at')
      .eq('bank_id', id)
      .order('created_at', { ascending: true })

    questions = (qs ?? []) as BankQuestion[]
  }

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <BankDetailClient
          bankId={isNew ? null : id}
          initialBank={bank}
          initialQuestions={questions}
        />
      </div>
    </main>
  )
}
