import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

export default async function OnboardingPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <main className="mx-auto max-w-xl px-6 py-20 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 mb-6">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-7 h-7 text-amber-600"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>

      <h1 className="text-2xl font-bold text-slate-950">Organization not configured</h1>
      <p className="mt-3 text-sm text-slate-600 leading-relaxed">
        Your account isn&apos;t linked to an organization yet. This is required before you can
        access reports and other org-scoped features.
      </p>

      <div className="mt-8 border border-slate-200 bg-slate-50 rounded p-4 text-left text-xs text-slate-600 font-mono leading-relaxed">
        <p className="font-sans font-semibold text-slate-900 text-sm mb-2">Admin: fix via SQL editor</p>
        <pre className="whitespace-pre-wrap break-all">{`UPDATE profiles p
SET org_id = om.org_id
FROM org_members om
WHERE om.user_id = p.auth_id
  AND p.org_id IS NULL;

SELECT refresh_report_materialized_views();`}</pre>
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Or re-run <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">npm run demo:reset</code> to
        regenerate all demo data with organization links in place.
      </p>
    </main>
  )
}
