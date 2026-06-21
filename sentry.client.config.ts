import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Capture 10% of transactions for performance monitoring
  tracesSampleRate: 0.1,

  // Don't capture 404s — they are noise, not signal
  ignoreErrors: ['NEXT_NOT_FOUND', 'Not found'],

  // Don't send events in development
  enabled: process.env.NODE_ENV === 'production',
})
