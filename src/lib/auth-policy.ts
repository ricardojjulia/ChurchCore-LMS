// Organization sign-in policy (COUNCIL-2026-037): require SSO for staff,
// restrict email domains, turn passwords off. Pure functions, so the rules
// are unit-tested; enforcement runs server-side on every page (root layout)
// and on the SSO join path.

export interface AuthPolicy {
  require_sso_for_staff: boolean
  allowed_domains: string[]
  disable_password: boolean
}

export type PolicyViolation = 'sso_required' | 'domain_not_allowed' | 'password_disabled'

const STAFF = new Set(['admin', 'manager', 'teacher'])
// Methods that count as single sign-on. Magic links / OTP (demo login, signup
// verification) are passwordless but not SSO.
const SSO_METHODS = new Set(['oauth', 'sso/saml'])

export function readAuthPolicy(settings: unknown): AuthPolicy {
  const auth = ((settings as { auth?: Partial<AuthPolicy> } | null)?.auth ?? {}) as Partial<AuthPolicy>
  return {
    require_sso_for_staff: auth.require_sso_for_staff === true,
    allowed_domains: Array.isArray(auth.allowed_domains)
      ? auth.allowed_domains.map((d) => String(d).trim().toLowerCase()).filter(Boolean)
      : [],
    disable_password: auth.disable_password === true,
  }
}

export function signInMethods(amr: unknown): string[] {
  return Array.isArray(amr) ? amr.map((a) => String((a as { method?: string })?.method ?? a)) : []
}

export function checkAuthPolicy(
  policy: AuthPolicy,
  user: { role: string | null; email: string | null; methods: string[] },
): PolicyViolation | null {
  const domain = (user.email ?? '').split('@')[1]?.toLowerCase() ?? ''
  if (policy.allowed_domains.length > 0 && !policy.allowed_domains.includes(domain)) return 'domain_not_allowed'
  const usedSso = user.methods.some((m) => SSO_METHODS.has(m))
  if (policy.require_sso_for_staff && STAFF.has(user.role ?? '') && !usedSso) return 'sso_required'
  if (policy.disable_password && user.methods.includes('password')) return 'password_disabled'
  return null
}

const DOMAIN_RE = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

export function parseDomains(input: string): { domains: string[]; invalid: string[] } {
  const parts = input.split(/[\s,]+/).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)
  const domains = [...new Set(parts.filter((d) => DOMAIN_RE.test(d)))]
  return { domains, invalid: parts.filter((d) => !DOMAIN_RE.test(d)) }
}
