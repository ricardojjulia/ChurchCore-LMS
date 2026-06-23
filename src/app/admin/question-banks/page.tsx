import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import QuestionBanksListClient from './QuestionBanksListClient'

export const dynamic = 'force-dynamic'

interface QuestionBank {
  id:           string
  name:         string
  description:  string | null
  created_at:   string
  question_count: number
}

export default async function QuestionBanksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: pr } = await supabase
    .from('profile_roles')
    .select('role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!pr || !['admin', 'manager'].includes(pr.role)) redirect('/dashboard')

  const { data: banks } = await supabase
    .from('question_banks')
    .select('id, name, description, created_at')
    .eq('org_id', pr.org_id)
    .order('name', { ascending: true })

  // Fetch question counts per bank
  const bankIds = (banks ?? []).map((b) => b.id)
  let countMap: Record<string, number> = {}
  if (bankIds.length > 0) {
    const { data: counts } = await supabase
      .from('bank_questions')
      .select('bank_id')
      .in('bank_id', bankIds)

    for (const row of counts ?? []) {
      countMap[row.bank_id] = (countMap[row.bank_id] ?? 0) + 1
    }
  }

  const banksWithCounts: QuestionBank[] = (banks ?? []).map((b) => ({
    ...b,
    question_count: countMap[b.id] ?? 0,
  }))

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Question Banks</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Reusable question pools that can be drawn randomly into any quiz.
            </p>
          </div>
          <Link
            href="/admin/question-banks/new"
            className="shrink-0 inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            + New Bank
          </Link>
        </div>

        <QuestionBanksListClient initialBanks={banksWithCounts} />
      </div>
    </main>
  )
}
