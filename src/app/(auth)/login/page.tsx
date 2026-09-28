'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import SsoButtons from '@/components/auth/SsoButtons'
import BotCheck, { BOT_CHECK_ENABLED, type BotCheckHandle } from '@/components/auth/BotCheck'

const POLICY_ERRORS = ['sso_required', 'domain_not_allowed', 'password_disabled', 'auth_callback_failed']

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [botToken, setBotToken] = useState<string | null>(null)
  const botCheck = useRef<BotCheckHandle>(null)
  const onBotToken = useCallback((token: string | null) => setBotToken(token), [])
  const router = useRouter()
  const t = useTranslations()

  // Reasons a session was ended or a sign-in didn't finish (COUNCIL-2026-037).
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('error')
    if (reason && POLICY_ERRORS.includes(reason)) setError(t(`auth.sso.errors.${reason}`))
  }, [t])

  // Sign-in runs on the server (COUNCIL-2026-045) so its limits and bot
  // check can't be skipped; it sets the session cookies.
  // Inputs are uncontrolled and read on submit, so text typed before the
  // page hydrates (slow phones) isn't wiped by hydration.
  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    if (BOT_CHECK_ENABLED && !botToken) return
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, turnstileToken: botToken }),
    }).catch(() => null)
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { code?: string; minutes?: number } | null
      const code = body?.code
      setError(code && ['invalid_credentials', 'too_many', 'captcha', 'invalid_input'].includes(code)
        ? t(`auth.login.errors.${code}`, { minutes: body?.minutes ?? 1 })
        : t('auth.login.errors.generic'))
      botCheck.current?.reset()
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <h1 className="text-2xl font-extrabold text-white mb-1">{t('auth.login.heading')}</h1>
        <p className="text-slate-400 text-sm mb-6">{t('auth.login.brandSubtitle')}</p>
        <div className="mb-4"><SsoButtons next="/dashboard" dark /></div>
        <form onSubmit={handleSignIn} method="post" className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-slate-300 mb-1">{t('auth.login.emailLabel')}</label>
            <input
              id="login-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
              placeholder={t('common.emailPlaceholder')}
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-300 mb-1">{t('common.password')}</label>
            <input
              id="login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="••••••••"
            />
          </div>
          <div className="flex justify-end -mt-2">
            <Link href="/forgot-password" className="text-sm text-indigo-300 underline hover:text-indigo-200">{t('auth.login.forgot')}</Link>
          </div>
          <BotCheck ref={botCheck} onToken={onBotToken} dark />
          {error && <p role="alert" className="text-rose-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || (BOT_CHECK_ENABLED && !botToken)}
            className="w-full bg-indigo-600 text-white font-bold rounded-xl py-3 hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('auth.login.submitLoading') : t('auth.login.submitButton')}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-300">
          {t('auth.login.newChurch')}{' '}
          <Link href="/start" className="font-semibold text-indigo-300 underline hover:text-indigo-200">{t('auth.login.startTrial')}</Link>
        </p>
      </div>
    </main>
  )
}
