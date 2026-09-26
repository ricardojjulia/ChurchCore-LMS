// Post-auth redirect targets come from the query string, so they must be
// confined to this origin. `${origin}${next}` with next = "@evil.example"
// yields "https://app@evil.example" — a redirect to evil.example — and
// "//evil.example" or "/\evil.example" are protocol-relative in browsers.
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/')) return fallback
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback
  // Resolve against a throwaway origin; anything that escapes it is rejected.
  try {
    const url = new URL(next, 'http://same-origin.invalid')
    if (url.origin !== 'http://same-origin.invalid') return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
