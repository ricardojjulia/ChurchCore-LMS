import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,

  tracesSampleRate: 0.1,

  ignoreErrors: ['NEXT_NOT_FOUND', 'Not found'],

  enabled: process.env.NODE_ENV === 'production',
})
