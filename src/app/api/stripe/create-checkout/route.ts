import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // Auth — platform admin or org admin only
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  const isPlatformAdmin = await supabase
    .rpc('is_platform_admin')
    .then((r) => r.data === true)

  if (!isPlatformAdmin && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  let body: { orgId?: string; priceId?: string; successUrl?: string; cancelUrl?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { orgId, priceId, successUrl, cancelUrl } = body
  if (!orgId || !priceId || !successUrl || !cancelUrl) {
    return NextResponse.json(
      { error: 'orgId, priceId, successUrl, and cancelUrl are required' },
      { status: 400 }
    )
  }

  const svc = createServiceClient()
  const { data: org } = await svc
    .from('organizations')
    .select('id, name, stripe_customer_id, is_synthetic')
    .eq('id', orgId)
    .single()

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  // The post-release synthetic-QA tenant is never billed (COUNCIL-2026-031 D8).
  if (org.is_synthetic) return NextResponse.json({ error: 'Billing is not available for this organization' }, { status: 400 })

  // Reuse the existing Stripe customer if one was already created for this org
  // (e.g. a prior checkout attempt was abandoned) — otherwise every retry
  // would mint a new, orphaned Stripe customer. Persist the id synchronously
  // here rather than relying solely on the checkout.session.completed webhook,
  // which can be delayed or never fire if the shopper never completes payment —
  // stripe_customer_id was previously never written at all, permanently
  // blocking billing-portal access for every org.
  let customerId = org.stripe_customer_id as string | null
  if (!customerId) {
    const customer = await getStripe().customers.create({
      name:     org.name,
      metadata: { org_id: orgId },
    })
    customerId = customer.id
    await svc.from('organizations').update({ stripe_customer_id: customerId }).eq('id', orgId)
  }

  const session = await getStripe().checkout.sessions.create({
    customer:              customerId,
    payment_method_types:  ['card'],
    line_items:            [{ price: priceId, quantity: 1 }],
    mode:                  'subscription',
    success_url:           successUrl,
    cancel_url:            cancelUrl,
    metadata:              { org_id: orgId, price_id: priceId },
    subscription_data:     { metadata: { org_id: orgId } },
  })

  return NextResponse.json({ url: session.url })
}
