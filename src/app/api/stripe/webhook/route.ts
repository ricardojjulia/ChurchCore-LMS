import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe }     from '@/lib/stripe'
import { createServiceClient } from '@/utils/supabase/service'
import { PLAN_FEATURES, PRICE_TO_PLAN } from '@/lib/stripe-plans'

// Raw body required — Stripe signature verification cannot work on a parsed body
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig     = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
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

// Synthetic QA tenants are never billed (COUNCIL-2026-031 D8): billing events
// naming one are acknowledged but never change its status or plan.
async function isSyntheticOrg(svc: Svc, orgId: string | undefined) {
  if (!orgId) return false
  const { data } = await svc.from('organizations').select('is_synthetic').eq('id', orgId).maybeSingle()
  return data?.is_synthetic === true
}

async function handleStripeEvent(event: Stripe.Event, svc: Svc) {
  const metadata = (event.data.object as { metadata?: Stripe.Metadata | null }).metadata
  if (await isSyntheticOrg(svc, metadata?.org_id)) return

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const metaType = session.metadata?.type

      // Course Storefront Purchase fulfillment (COUNCIL-2026-039)
      if (metaType === 'course_purchase') {
        const courseId = session.metadata?.course_id
        const orgId = session.metadata?.org_id
        const buyerUid = session.metadata?.buyer_uid
        const buyerEmail = session.customer_details?.email || session.metadata?.buyer_email || ''

        if (!courseId || !orgId) break

        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || null

        // Update purchase record
        await svc
          .from('course_purchases')
          .update({
            status: 'succeeded',
            stripe_payment_intent_id: paymentIntentId,
            amount_cents: session.amount_total || 0,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_checkout_session_id', session.id)

        // Find profile auth_id to enroll
        let targetAuthId: string | null = null
        if (buyerUid) {
          const { data: p } = await svc.from('profiles').select('auth_id').eq('uid', buyerUid).maybeSingle()
          targetAuthId = p?.auth_id || null
        } else if (buyerEmail) {
          const { data: p } = await svc.from('profiles').select('auth_id').eq('email', buyerEmail).maybeSingle()
          targetAuthId = p?.auth_id || null
        }

        if (targetAuthId) {
          const { enrollCore } = await import('@/lib/enrollment-core')
          await enrollCore({
            supabase: svc,
            authId: targetAuthId,
            courseId,
          })
        }
        break
      }

      const orgId   = session.metadata?.org_id
      const priceId = session.metadata?.price_id
      const plan    = PRICE_TO_PLAN[priceId ?? ''] ?? 'starter'
      if (!orgId) break

      const { data: org } = await svc
        .from('organizations')
        .select('settings, stripe_customer_id')
        .eq('id', orgId)
        .single()

      const currentSettings = (org?.settings ?? {}) as Record<string, unknown>
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
      await svc.from('organizations').update({
        status:   'active',
        plan,
        settings: { ...currentSettings, features: PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter },
        ...(!org?.stripe_customer_id && customerId ? { stripe_customer_id: customerId } : {}),
      }).eq('id', orgId)
      break
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null
      if (paymentIntentId) {
        await svc
          .from('course_purchases')
          .update({
            status: 'refunded',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', paymentIntentId)
      }
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
