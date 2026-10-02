import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import RenewPlans from './RenewPlans'

export const dynamic = 'force-dynamic'

// COUNCIL-2026-034 Amendment 8: when an organization is suspended (for
// example an expired trial), its RLS helpers return no org, so the normal
// billing page can't load. This page resolves the caller's membership with
// the service client — reading only their own row — so an admin can still
// pay, and everyone else gets a clear notice.
export default async function RenewPage() {
  const t = await getTranslations('renew')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: membership } = await service
    .from('profile_roles')
    .select('role, org_id, tenant_active')
    .eq('auth_id', user.id)
    .maybeSingle()
  if (!membership?.org_id) redirect('/dashboard')
  if (membership.tenant_active) redirect(membership.role === 'admin' ? '/admin/billing' : '/dashboard')

  const { data: org } = await service
    .from('organizations')
    .select('name, status, trial_ends_at, is_synthetic')
    .eq('id', membership.org_id)
    .single()
  const expiredTrial = !!org?.trial_ends_at && Date.parse(org.trial_ends_at) < Date.now()

  const plans = [
    { id: 'starter', priceId: process.env.STRIPE_PRICE_STARTER ?? '' },
    { id: 'growth', priceId: process.env.STRIPE_PRICE_GROWTH ?? '' },
    { id: 'enterprise', priceId: process.env.STRIPE_PRICE_ENTERPRISE ?? '' },
  ].filter((p) => p.priceId)

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100 flex items-center justify-center">
      <div className="mx-auto max-w-xl w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-white">
          {expiredTrial ? t('trialEndedTitle', { name: org?.name ?? '' }) : t('pausedTitle', { name: org?.name ?? '' })}
        </h1>
        {membership.role === 'admin' && !org?.is_synthetic ? (
          <>
            <p className="mt-3 text-slate-300">{t('adminBody')}</p>
            <RenewPlans plans={plans} />
          </>
        ) : (
          <p className="mt-3 text-slate-300">{t('memberBody')}</p>
        )}
      </div>
    </main>
  )
}
