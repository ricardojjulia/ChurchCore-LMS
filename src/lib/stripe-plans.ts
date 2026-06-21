export const PLAN_FEATURES: Record<string, Record<string, boolean>> = {
  starter: {
    courses:   true,
    reporting: true,
    ai_tutor:  false,
    hq:        false,
    guardian:  false,
  },
  growth: {
    courses:   true,
    reporting: true,
    ai_tutor:  true,
    hq:        true,
    guardian:  true,
  },
  enterprise: {
    courses:   true,
    reporting: true,
    ai_tutor:  true,
    hq:        true,
    guardian:  true,
  },
}

// Map Stripe Price IDs → plan slugs. Set price IDs in Stripe dashboard and
// add the corresponding env vars: STRIPE_PRICE_STARTER, _GROWTH, _ENTERPRISE
export const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_PRICE_STARTER    ?? '']: 'starter',
  [process.env.STRIPE_PRICE_GROWTH     ?? '']: 'growth',
  [process.env.STRIPE_PRICE_ENTERPRISE ?? '']: 'enterprise',
}
