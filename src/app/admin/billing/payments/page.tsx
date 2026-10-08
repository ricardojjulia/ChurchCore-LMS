import React from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import PaymentsPageClient from './PaymentsPageClient'

export const dynamic = 'force-dynamic'

export default async function AdminPaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'manager' && profile?.role !== 'platform_admin') {
    redirect('/dashboard')
  }

  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name, stripe_connect_id, stripe_connect_status')
    .eq('id', profile.org_id)
    .single()

  if (error || !org) {
    redirect('/admin/billing')
  }

  const svc = createServiceClient()

  // Fetch recent purchases for this org
  const { data: rawPurchases } = await svc
    .from('course_purchases')
    .select('*, courses(title)')
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const purchases = (rawPurchases || []).map(p => ({
    id: p.id,
    org_id: p.org_id,
    course_id: p.course_id,
    buyer_uid: p.buyer_uid,
    buyer_email: p.buyer_email,
    stripe_checkout_session_id: p.stripe_checkout_session_id,
    stripe_payment_intent_id: p.stripe_payment_intent_id,
    amount_cents: p.amount_cents,
    currency: p.currency,
    status: p.status,
    metadata: p.metadata,
    created_at: p.created_at,
    updated_at: p.updated_at,
    course_title: (p.courses as any)?.title || 'Course',
  }))

  // Count active paid courses
  const { count: paidCoursesCount } = await svc
    .from('courses')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', org.id)
    .gt('price_cents', 0)

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/billing" className="text-xs text-indigo-400 hover:underline">
              ← Billing & Subscription
            </Link>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-400">Storefront & Payouts</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              🛒
            </span>
            Course Storefront & Payments
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Configure direct church payouts via Stripe Connect, sell course seats with custom pricing, and review buyer transaction history.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/courses"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-all"
          >
            Manage Course Pricing →
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <PaymentsPageClient
        org={{
          id: org.id,
          name: org.name,
          stripeConnectId: org.stripe_connect_id,
          stripeConnectStatus: org.stripe_connect_status || 'not_connected',
        }}
        purchases={purchases}
        paidCoursesCount={paidCoursesCount || 0}
      />
    </div>
  )
}
