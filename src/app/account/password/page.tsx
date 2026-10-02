import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/utils/supabase/server'
import { linkSessionIsFresh } from '@/lib/password-policy'
import Link from 'next/link'
import PasswordForm from './PasswordForm'

export const dynamic = 'force-dynamic'

// Set or change the account password (COUNCIL-2026-045). Reached from a reset
// link, from the profile page, or by a /start admin who has no password yet.
export default async function AccountPasswordPage({ searchParams }: { searchParams: Promise<{ reset?: string; welcome?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: claims } = await supabase.auth.getClaims()
  const fromLink = linkSessionIsFresh(claims?.claims?.amr)
  const { reset, welcome } = await searchParams
  const t = await getTranslations('auth.password')

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-16 text-slate-100 flex items-center justify-center">
      <div className="mx-auto max-w-md w-full bg-slate-900 rounded-2xl border border-slate-800 p-8 space-y-4 shadow-sm">
        <h1 className="text-2xl font-bold text-white">{fromLink ? t('heading') : t('changeHeading')}</h1>
        <p className="text-sm text-slate-300">{welcome ? t('welcomeIntro') : reset ? t('resetIntro') : t('intro')}</p>
        <PasswordForm needsCurrent={!fromLink} />
        {(welcome || reset) && (
          <p className="text-sm"><Link href="/dashboard" className="font-semibold text-indigo-400 hover:text-indigo-300 underline">{t('continue')}</Link></p>
        )}
      </div>
    </main>
  )
}
