// Which OAuth providers are live (COUNCIL-2026-037). Providers are configured
// in Supabase Auth with the owner's client credentials; this list only
// controls which buttons appear, so a button never points at a provider that
// isn't set up. NEXT_PUBLIC_SSO_PROVIDERS="google,azure,churchcore".
export type SsoProvider = 'google' | 'azure' | 'churchcore'

const KNOWN: SsoProvider[] = ['google', 'azure', 'churchcore']

export function configuredSsoProviders(): SsoProvider[] {
  const raw = (process.env.NEXT_PUBLIC_SSO_PROVIDERS ?? '').split(',').map((p) => p.trim().toLowerCase())
  return KNOWN.filter((p) => raw.includes(p))
}
