import Link           from 'next/link'
import { notFound }   from 'next/navigation'
import { createServiceClient } from '@/utils/supabase/service'
import { stripe }     from '@/lib/stripe'
import { PLAN_FEATURES } from '@/lib/stripe-plans'
import BillingActions from './BillingActions'

export const dynamic = 'force-dynamic'

interface Props {
  params: { id: string }
}

export default async function BillingPage({ params }: Props) {
  const service = createServiceClient()

  const { data: org } = await service
    .from('organizations')
    .select('id, name, slug, plan, status, settings')
    .eq('id', params.id)
    .single()

  if (!org) notFound()

  const plan    = (org.plan as string | null) ?? 'starter'
  const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter

  // Fetch Stripe invoices if a customer exists
  let invoices: { id: string; created: number; amount_paid: number; status: string | null; hosted_invoice_url: string | null | undefined }[] = []
  let nextBillingDate: string | null = null

  try {
    const customers = await stripe.customers.search({
      query: `metadata['org_id']:'${org.id}'`,
      limit: 1,
    })
    const customer = customers.data[0]

    if (customer) {
      const [invoiceList, subscriptions] = await Promise.all([
        stripe.invoices.list({ customer: customer.id, limit: 10 }),
        stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 1 }),
      ])

      invoices = invoiceList.data.map((inv) => ({
        id:                 inv.id,
        created:            inv.created,
        amount_paid:        inv.amount_paid,
        status:             inv.status,
        hosted_invoice_url: inv.hosted_invoice_url,
      }))

      const activeSub = subscriptions.data[0]
      const periodEnd = activeSub?.items.data[0]?.current_period_end
      if (periodEnd) {
        nextBillingDate = new Date(periodEnd * 1000).toLocaleDateString()
      }
    }
  } catch {
    // Stripe unavailable — degrade gracefully
  }

  const priceIds = {
    starter:    process.env.STRIPE_PRICE_STARTER    ?? '',
    growth:     process.env.STRIPE_PRICE_GROWTH     ?? '',
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? '',
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/platform" className="hover:text-slate-300">Tenants</Link>
        <span>/</span>
        <Link href={`/platform/tenants/${org.id}`} className="hover:text-slate-300">{org.name}</Link>
        <span>/</span>
        <span className="text-slate-300">Billing</span>
      </div>

      {/* Current plan */}
      <section className="bg-white rounded-xl border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Current plan</h2>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold capitalize">{plan}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            org.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {org.status}
          </span>
        </div>
        {nextBillingDate && (
          <p className="text-sm text-muted-foreground">Next billing: {nextBillingDate}</p>
        )}

        <div className="grid grid-cols-2 gap-2 mt-4">
          {Object.entries(features).map(([feature, enabled]) => (
            <div key={feature} className="flex items-center gap-2 text-sm">
              <span className={enabled ? 'text-green-600' : 'text-slate-400'}>
                {enabled ? '✓' : '✗'}
              </span>
              <span className={enabled ? '' : 'text-muted-foreground'}>
                {feature.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Upgrade / manage */}
      <BillingActions
        orgId={org.id}
        currentPlan={plan}
        orgStatus={org.status as string}
        priceIds={priceIds}
      />

      {/* Past invoices */}
      {invoices.length > 0 && (
        <section className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Past invoices</h2>
          <div className="overflow-x-auto rounded-md border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="py-2">
                    <td className="py-2">
                      {new Date(inv.created * 1000).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      ${(inv.amount_paid / 100).toFixed(2)}
                    </td>
                    <td className="py-2 capitalize">{inv.status}</td>
                    <td className="py-2">
                      {inv.hosted_invoice_url && (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline text-xs"
                        >
                          View
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
