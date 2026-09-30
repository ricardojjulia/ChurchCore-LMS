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
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        <h1 className="text-3xl font-extrabold text-foreground">{t('title')}</h1>
        {signupEnabled() ? (
          <>
            <p className="mt-2 text-slate-700">{t('subtitle')}</p>
            {error && (
              <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {t(`errors.${['slug_taken', 'invalid_link', 'failed'].includes(error) ? error : 'generic'}`)}
              </p>
            )}
            <StartForm />
          </>
        ) : (
          <div className="mt-6 rounded-xl border border-border bg-white p-6">
            <h2 className="text-lg font-bold text-foreground">{t('comingSoonTitle')}</h2>
            <p className="mt-2 text-sm text-slate-700">{t('comingSoonBody')}</p>
          </div>
        )}
        <p className="mt-6 text-sm text-slate-700">
          {t('haveAccount')} <Link href="/login" className="font-semibold text-indigo-700 underline">{t('signIn')}</Link>
        </p>
      </div>
    </main>
  )
}
