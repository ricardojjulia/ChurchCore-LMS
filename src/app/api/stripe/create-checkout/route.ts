import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { PRICE_TO_PLAN } from '@/lib/stripe-plans'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // Auth — platform admin, or an org admin for their own org only
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isPlatformAdmin = await supabase
    .rpc('is_platform_admin')
    .then((r) => r.data === true)

  const svc = createServiceClient()

  // Org admins check out their own org only, resolved server-side. This works
  // while the org is suspended (an expired trial), when RLS helpers return no
  // org. Platform admins may target any org.
  let ownOrgId: string | null = null
  if (!isPlatformAdmin) {
    const { data: membership } = await svc
      .from('profile_roles')
      .select('org_id, role')
      .eq('auth_id', user.id)
      .maybeSingle()
    if (membership?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    ownOrgId = membership.org_id
  }

  let body: { orgId?: string; priceId?: string; successUrl?: string; cancelUrl?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // Only the plans we sell (COUNCIL-2026-034 Amendment 6). Unset env vars map
  // the empty string, which must never count as a price.
  const priceId = body.priceId ?? ''
  if (!priceId || !Object.prototype.hasOwnProperty.call(PRICE_TO_PLAN, priceId)) {
    return NextResponse.json({ error: 'Unknown plan' }, { status: 400 })
  }

  if (ownOrgId && body.orgId && body.orgId !== ownOrgId) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }
  const orgId = isPlatformAdmin ? body.orgId : ownOrgId
  if (!orgId) return NextResponse.json({ error: 'orgId is required' }, { status: 400 })

  // Return URLs stay on this site: only same-origin URLs are kept.
  const sameOrigin = (url: string | undefined, fallback: string) => {
    try {
      const parsed = new URL(url ?? '', req.nextUrl.origin)
      return parsed.origin === req.nextUrl.origin ? parsed.toString() : `${req.nextUrl.origin}${fallback}`
    } catch {
      return `${req.nextUrl.origin}${fallback}`
    }
  }
  const successUrl = sameOrigin(body.successUrl, '/admin/billing?upgraded=1')
  const cancelUrl = sameOrigin(body.cancelUrl, '/admin/billing')

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
  let session: { url: string | null }
  try {
    let customerId = org.stripe_customer_id as string | null
    if (!customerId) {
      const customer = await getStripe().customers.create({
        name:     org.name,
        metadata: { org_id: orgId },
      })
      customerId = customer.id
      await svc.from('organizations').update({ stripe_customer_id: customerId }).eq('id', orgId)
    }

    session = await getStripe().checkout.sessions.create({
      customer:              customerId,
      payment_method_types:  ['card'],
      line_items:            [{ price: priceId, quantity: 1 }],
      mode:                  'subscription',
      success_url:           successUrl,
      cancel_url:            cancelUrl,
      metadata:              { org_id: orgId, price_id: priceId },
      subscription_data:     { metadata: { org_id: orgId } },
    })
  } catch {
    return NextResponse.json({ error: 'Payment provider unavailable' }, { status: 502 })
  }

  return NextResponse.json({ url: session.url })
}
