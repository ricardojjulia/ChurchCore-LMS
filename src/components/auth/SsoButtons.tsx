'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/utils/supabase/client'
import { configuredSsoProviders, type SsoProvider } from '@/lib/sso'

// "Continue with Google / Microsoft" (COUNCIL-2026-037). `next` is where the
// callback sends the user afterwards; /callback confines it to this site.
export default function SsoButtons({ next, dark = false }: { next: string; dark?: boolean }) {
  const t = useTranslations('auth.sso')
  const [pending, setPending] = useState<SsoProvider | null>(null)
  const [error, setError] = useState<string | null>(null)
  const providers = configuredSsoProviders()
  if (providers.length === 0) return null

  async function start(provider: SsoProvider) {
    setError(null)
    setPending(provider)
    const redirectTo = `${window.location.origin}/callback?next=${encodeURIComponent(next)}`
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo, ...(provider === 'azure' ? { scopes: 'email' } : {}) },
    })
    if (oauthError) { setError(t('error')); setPending(null) }
  }

  const style = dark
    ? 'border-slate-600 bg-slate-800 text-white hover:bg-slate-700'
    : 'border-border bg-white text-slate-900 hover:bg-slate-50'
  return (
    <div className="space-y-2">
      {providers.map((p) => (
        <button key={p} type="button" onClick={() => start(p)} disabled={pending !== null}
          className={`w-full rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${style}`}>
          {pending === p ? t('redirecting') : t(p === 'google' ? 'google' : 'microsoft')}
        </button>
      ))}
      <p className={`text-center text-xs ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{t('or')}</p>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
    </div>
  )
}
