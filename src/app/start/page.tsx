import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/utils/supabase/server'
import { signupEnabled } from '@/lib/signup'
import StartForm from './StartForm'

export const dynamic = 'force-dynamic'

// Public self-serve signup (COUNCIL-2026-034). Behind SELF_SERVE_SIGNUP_ENABLED
// until production email works (Amendment 5).
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const t = await getTranslations('signup')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100 flex items-center justify-center">
      <div className="mx-auto max-w-lg w-full">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('title')}</h1>
        {signupEnabled() ? (
          <>
            <p className="mt-2 text-slate-400">{t('subtitle')}</p>
            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-rose-800/80 bg-rose-950/50 p-3 text-sm text-rose-400">
                {t(`errors.${['slug_taken', 'invalid_link', 'failed'].includes(error) ? error : 'generic'}`)}
              </p>
            )}
            <StartForm />
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-white">{t('comingSoonTitle')}</h2>
            <p className="mt-2 text-sm text-slate-400">{t('comingSoonBody')}</p>
          </div>
        )}
        <p className="mt-6 text-sm text-slate-400">
          {t('haveAccount')} <Link href="/login" className="font-semibold text-indigo-400 hover:text-indigo-300 underline">{t('signIn')}</Link>
        </p>
      </div>
    </main>
  )
}
