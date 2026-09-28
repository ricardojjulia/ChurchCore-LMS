// The site's own base URL for links in emails. Always from configuration,
// never from the request: the Host header is attacker-controlled, and a
// spoofed one would put the attacker's domain in a genuine email (CodeQL,
// PR #36).
export function siteBaseUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_BASE_URL
  if (configured) return configured.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return vercel ? `https://${vercel}` : null
}
