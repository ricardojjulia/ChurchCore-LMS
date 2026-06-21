// Central env validation. Import this module for a loud startup failure
// rather than a silent undefined at call time.
// Required vars throw immediately; optional vars default to ''.

function required(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

function optional(key: string): string {
  return process.env[key] ?? ''
}

export const env = {
  // ── Supabase (always required) ──────────────────────────
  supabaseUrl:        required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey:    required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceKey: required('SUPABASE_SERVICE_ROLE_KEY'),

  // ── Email / Resend (required for invite + digest) ───────
  resendApiKey: required('RESEND_API_KEY'),
  emailFrom:    required('EMAIL_FROM'),

  // ── Stripe (required for billing; optional in dev) ──────
  stripeSecretKey:     optional('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: optional('STRIPE_WEBHOOK_SECRET'),
  stripePriceStarter:  optional('STRIPE_PRICE_STARTER'),
  stripePriceGrowth:   optional('STRIPE_PRICE_GROWTH'),
  stripePriceEnterprise: optional('STRIPE_PRICE_ENTERPRISE'),

  // ── Upstash Redis (required for rate limiting) ──────────
  upstashRedisUrl:   optional('UPSTASH_REDIS_REST_URL'),
  upstashRedisToken: optional('UPSTASH_REDIS_REST_TOKEN'),

  // ── Turnstile CAPTCHA (required for /join) ──────────────
  turnstileSecretKey: optional('TURNSTILE_SECRET_KEY'),

  // ── Sentry (optional) ───────────────────────────────────
  sentryDsn: optional('SENTRY_DSN'),

  // ── App URL (for emails + Edge Functions) ───────────────
  appUrl: optional('NEXT_PUBLIC_APP_URL'),
}
