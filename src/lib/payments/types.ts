// Paid Courses & Stripe Connect Types (COUNCIL-2026-039)

export type StripeConnectStatus = 'not_connected' | 'pending' | 'active' | 'restricted'

export interface CoursePricingConfig {
  priceCents: number
  currency: string
  seatLimit?: number | null
}

export interface CoursePurchase {
  id: string
  org_id: string
  course_id: string
  buyer_uid?: string | null
  buyer_email: string
  stripe_checkout_session_id?: string | null
  stripe_payment_intent_id?: string | null
  amount_cents: number
  currency: string
  status: 'pending' | 'succeeded' | 'refunded' | 'failed'
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CourseCheckoutParams {
  courseId: string
  courseTitle: string
  priceCents: number
  currency: string
  orgId: string
  stripeConnectId?: string | null
  buyerUid?: string | null
  buyerEmail?: string | null
  successUrl: string
  cancelUrl: string
}
