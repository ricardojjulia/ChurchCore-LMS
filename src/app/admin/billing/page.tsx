import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { PLAN_FEATURES } from '@/lib/stripe-plans'
import BillingPageClient from './BillingPageClient'

export const dynamic = 'force-dynamic'

export default async function AdminBillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'manager') redirect('/dashboard')

  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name, plan, status, stripe_customer_id')
    .eq('id', profile.org_id)
    .single()

  if (error || !org) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[admin/billing]', error)
    }
    return (
      <main className="min-h-screen bg-slate-950 py-10 px-4 text-slate-100">
        <p className="text-rose-400">
          Failed to load billing information. Please refresh the page or contact support.
        </p>
      </main>
    )
  }

  const plan = (org.plan as string | null) ?? 'starter'
  const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter ?? {}

  const starterPriceId = process.env.STRIPE_PRICE_STARTER ?? ''

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Billing</h1>
            <p className="text-slate-400 mt-1 text-sm">
              Manage your subscription and view plan details for {org.name}.
            </p>
          </div>
          <a
            href="/admin/billing/payments"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all flex items-center gap-2 self-start sm:self-auto"
          >
            <span>💳 Course Storefront Payouts</span>
            <span>→</span>
          </a>
        </div>

        <BillingPageClient
          org={{
            id:                 org.id,
            name:               org.name,
            plan,
            status:             org.status as string,
            stripe_customer_id: org.stripe_customer_id as string | null,
          }}
          features={features}
          starterPriceId={starterPriceId}
        />
      </div>
    </main>
  )
}
