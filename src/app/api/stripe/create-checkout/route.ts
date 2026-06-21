import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
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
    .select('id, name')
    .eq('id', orgId)
    .single()

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  const customer = await stripe.customers.create({
    name:     org.name,
    metadata: { org_id: orgId },
  })

  const session = await stripe.checkout.sessions.create({
    customer:              customer.id,
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
