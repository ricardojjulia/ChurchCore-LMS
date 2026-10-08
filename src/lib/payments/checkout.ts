import { getStripe } from '@/lib/stripe'
import type { CourseCheckoutParams } from './types'

export async function createCourseCheckoutSession(params: CourseCheckoutParams): Promise<{
  sessionId: string
  url: string | null
}> {
  const stripe = getStripe()

  const sessionParams: any = {
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: (params.currency || 'usd').toLowerCase(),
          product_data: {
            name: params.courseTitle,
            description: `Enrollment in ${params.courseTitle}`,
          },
          unit_amount: params.priceCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    customer_email: params.buyerEmail || undefined,
    client_reference_id: params.buyerUid || undefined,
    metadata: {
      type: 'course_purchase',
      org_id: params.orgId,
      course_id: params.courseId,
      buyer_uid: params.buyerUid || '',
      buyer_email: params.buyerEmail || '',
    },
  }

  // If org has connected their own Stripe account (Option A: church collects directly, no platform fee)
  const options = params.stripeConnectId
    ? { stripeAccount: params.stripeConnectId }
    : undefined

  const session = await stripe.checkout.sessions.create(sessionParams, options)

  return {
    sessionId: session.id,
    url: session.url,
  }
}
