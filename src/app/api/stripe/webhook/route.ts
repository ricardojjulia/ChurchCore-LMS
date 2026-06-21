import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe }        from '@/lib/stripe'
import { createServiceClient } from '@/utils/supabase/service'
import { PLAN_FEATURES, PRICE_TO_PLAN } from '@/lib/stripe-plans'

// Raw body required — Stripe signature verification cannot work on a parsed body
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig     = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const svc = createServiceClient()

  // Idempotency check — skip events we've already handled
  const { data: existing } = await svc
    .from('platform_audit_log')
    .select('id')
    .eq('action', 'stripe_webhook')
    .contains('metadata', { stripe_event_id: event.id })
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    await handleStripeEvent(event, svc)
  } catch {
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  // Record in audit log — serves as the idempotency key for future duplicate checks
  await svc.from('platform_audit_log').insert({
    action:      'stripe_webhook',
    resource_id: event.id,
    actor_id:    null,
    metadata:    { stripe_event_id: event.id, type: event.type },
  })

  return NextResponse.json({ received: true })
}

type Svc = ReturnType<typeof createServiceClient>

async function handleStripeEvent(event: Stripe.Event, svc: Svc) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId   = session.metadata?.org_id
      const priceId = session.metadata?.price_id
      const plan    = PRICE_TO_PLAN[priceId ?? ''] ?? 'starter'
      if (!orgId) break

      const { data: org } = await svc
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .single()

      const currentSettings = (org?.settings ?? {}) as Record<string, unknown>
      await svc.from('organizations').update({
        status:   'active',
        plan,
        settings: { ...currentSettings, features: PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter },
      }).eq('id', orgId)
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      const orgId   = invoice.metadata?.org_id
      if (!orgId) break
      await svc.from('organizations').update({ status: 'active' }).eq('id', orgId)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const orgId   = invoice.metadata?.org_id
      if (!orgId) break
      // sync_org_status_to_profiles trigger propagates suspension to profile_roles
      await svc.from('organizations').update({ status: 'suspended' }).eq('id', orgId)
      break
    }

    case 'customer.subscription.deleted': {
      const sub   = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.org_id
      if (!orgId) break
      await svc.from('organizations').update({ status: 'suspended' }).eq('id', orgId)
      break
    }

    case 'customer.subscription.updated': {
      const sub     = event.data.object as Stripe.Subscription
      const orgId   = sub.metadata?.org_id
      const priceId = sub.items.data[0]?.price.id
      const plan    = PRICE_TO_PLAN[priceId ?? ''] ?? 'starter'
      if (!orgId) break

      const { data: org } = await svc
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .single()

      const currentSettings = (org?.settings ?? {}) as Record<string, unknown>
      await svc.from('organizations').update({
        plan,
        settings: { ...currentSettings, features: PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter },
      }).eq('id', orgId)
      break
    }
  }
}
