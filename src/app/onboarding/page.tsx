import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'

export default async function OnboardingPage() {
  const t = await getTranslations()
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-center text-slate-100 flex flex-col items-center justify-center">
      <div className="mx-auto max-w-xl w-full">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-950/60 border border-amber-800/80 mb-6">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="w-7 h-7 text-amber-400"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('onboarding.heading')}</h1>
        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          {t('onboarding.description')}
        </p>

        <div className="mt-8 border border-slate-800 bg-slate-900 rounded-2xl p-6 text-left text-xs text-slate-300 font-mono leading-relaxed shadow-sm">
          <p className="font-sans font-semibold text-white text-sm mb-2">{t('onboarding.adminFixLabel')}</p>
          <pre className="whitespace-pre-wrap break-all text-indigo-300 bg-slate-950 p-3 rounded-lg border border-slate-800">{`UPDATE profiles p
SET org_id = om.org_id
FROM org_members om
WHERE om.user_id = p.auth_id
  AND p.org_id IS NULL;

SELECT refresh_report_materialized_views();`}</pre>
        </div>

        <p className="mt-6 text-sm text-slate-400">
          Or re-run <code className="rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 font-mono text-xs text-amber-300">npm run demo:reset</code> to
          regenerate all demo data with organization links in place.
        </p>
      </div>
    </main>
  )
}
