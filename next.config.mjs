// @ts-check
import withPWA from '@ducanh2912/next-pwa'
import { withSentryConfig } from '@sentry/nextjs'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_HOST = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : '*.supabase.co'
const SUPABASE_WS   = SUPABASE_URL
  ? SUPABASE_URL.replace('https://', 'wss://')
  : 'wss://*.supabase.co'

const STRIPE_HOSTS = 'https://js.stripe.com https://checkout.stripe.com'

const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com " + STRIPE_HOSTS,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://${SUPABASE_HOST} https://*.supabase.co`,
  `connect-src 'self' https://${SUPABASE_HOST} ${SUPABASE_WS} https://*.supabase.co wss://*.supabase.co https://api.openai.com https://challenges.cloudflare.com`,
  "frame-src youtube.com www.youtube.com player.vimeo.com https://challenges.cloudflare.com https://checkout.stripe.com",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy',   value: ContentSecurityPolicy },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

const withPWAConfig = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    exclude: [/supabase\.co/, /^\/api\//, /\/auth\//],
    runtimeCaching: [
      { urlPattern: /^https:\/\/.*\.supabase\.co\/.*/, handler: 'NetworkOnly' },
      { urlPattern: /^\/api\/.*/, handler: 'NetworkOnly' },
    ],
    fallbacks: { document: '/offline' },
  },
})

export default withSentryConfig(withPWAConfig(nextConfig), {
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
})
