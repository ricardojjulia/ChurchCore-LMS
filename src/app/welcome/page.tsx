import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

// Where a signed-in account with no organization lands (for example a first
// "Continue with Google" without a join link). COUNCIL-2026-037: signing in
// never grants membership, so this explains the next step instead.
export default async function WelcomePage() {
  const t = await getTranslations('welcome')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('auth_id', user.id).maybeSingle()
  if (profile?.org_id) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-16 text-slate-100 flex items-center justify-center">
      <div className="mx-auto max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-sm">
        <h1 className="text-2xl font-extrabold text-white">{t('title')}</h1>
        <p className="mt-3 text-sm text-slate-300">{t('body')}</p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/start" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">{t('start')}</Link>
          <a href="/auth/sign-out" className="text-sm font-semibold text-slate-400 hover:text-white underline">{t('signOut')}</a>
        </div>
      </div>
    </main>
  )
}
