// @ts-check
import withPWA from '@ducanh2912/next-pwa'

/** @type {import('next').NextConfig} */
const nextConfig = {}

const withPWAConfig = withPWA({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    // Never cache Supabase (auth tokens, signed URLs expire) or API routes
    exclude: [
      /supabase\.co/,
      /^\/api\//,
      /\/auth\//,
    ],
    runtimeCaching: [
      {
        // Never cache Supabase requests — auth tokens and signed URLs expire
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/,
        handler: 'NetworkOnly',
      },
      {
        // Never cache API routes — dynamic and auth-sensitive
        urlPattern: /^\/api\/.*/,
        handler: 'NetworkOnly',
      },
    ],
    fallbacks: {
      document: '/offline',
    },
  },
})

export default withPWAConfig(nextConfig)
