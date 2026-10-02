'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'
import SsoButtons from '@/components/auth/SsoButtons'

interface Props {
  orgId:        string
  orgName:      string
  orgSlug:      string
  primaryColor?: string
}

export default function JoinForm({ orgId, orgName, orgSlug, primaryColor }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const [displayName, setDisplayName]   = useState('')
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [loading, setLoading]           = useState(false)
  // Turnstile tokens are single-use; a failed attempt needs a fresh one.
  const turnstile = useRef<TurnstileInstance | null>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!turnstileToken) {
      setError(t('join.form.turnstileMissingError'))
      return
    }

    setLoading(true)
    try {
      // Verify Turnstile and sign up in one server action call
      const { verifyAndEnroll } = await import('../actions')
      const result = await verifyAndEnroll({
        orgId,
        email,
        password,
        displayName,
        turnstileToken,
      })

      if (result.error) {
        setError(result.error)
        setTurnstileToken(null)
        turnstile.current?.reset()
        return
      }

      // Sign in after successful account creation
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError(t('join.form.accountCreatedNotice'))
        router.push('/login')
        return
      }

      router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  const btnStyle = primaryColor
    ? { backgroundColor: primaryColor }
    : undefined

  return (
    <>
    {/* SSO join finishes at /join/[slug]/complete, which applies the same org checks. */}
    <div className="mb-4"><SsoButtons next={`/join/${orgSlug}/complete`} /></div>
    <form onSubmit={handleSubmit} method="post" className="space-y-4">
      <div>
        <label htmlFor="displayName" className="block text-sm font-medium text-slate-300 mb-1">
          {t('join.form.fullNameLabel')}
        </label>
        <input
          id="displayName"
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder={t('join.form.namePlaceholder')}
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
          {t('join.form.emailLabel')}
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder={t('join.form.emailPlaceholder')}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
          {t('join.form.passwordLabel')}
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder={t('join.form.passwordPlaceholder')}
        />
      </div>

      <Turnstile
        ref={turnstile}
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''}
        onSuccess={setTurnstileToken}
        onError={() => setError(t('join.form.turnstileFailedError'))}
        onExpire={() => setTurnstileToken(null)}
        className="mt-2"
      />

      {error && (
        <p role="alert" className="text-sm text-rose-400 bg-rose-950/50 border border-rose-800/80 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !turnstileToken}
        style={btnStyle}
        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm"
      >
        {loading ? t('join.form.submitLoading') : t('join.form.submitButtonTemplate', { orgName })}
      </button>

      <p className="text-center text-sm text-slate-400">
        {t('join.form.alreadyHaveAccountText')}{' '}
        <a href="/login" className="text-indigo-400 hover:text-indigo-300 underline font-semibold">
          {t('join.form.signInLink')}
        </a>
      </p>
    </form>
    </>
  )
}
