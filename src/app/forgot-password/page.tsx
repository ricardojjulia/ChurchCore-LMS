'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import BotCheck, { BOT_CHECK_ENABLED, type BotCheckHandle } from '@/components/auth/BotCheck'

const ERRORS = ['unavailable', 'too_many', 'invalid_email', 'captcha', 'invalid_link']

// Password reset request (COUNCIL-2026-045). The answer is the same whether
// or not the email has an account.
export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgot')
  const tLogin = useTranslations('auth.login')
  const locale = useLocale()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [botToken, setBotToken] = useState<string | null>(null)
  const botCheck = useRef<BotCheckHandle>(null)
  const onBotToken = useCallback((token: string | null) => setBotToken(token), [])

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('error')
    if (reason === 'invalid_link') setError(t('errors.invalid_link'))
  }, [t])

  // Uncontrolled input, read on submit: survives typing before hydration.
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email') ?? '')
    if (BOT_CHECK_ENABLED && !botToken) return
    setLoading(true)
    setError(null)
    const res = await fetch('/api/auth/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, turnstileToken: botToken, locale }),
    }).catch(() => null)
    setLoading(false)
    if (res?.ok) { setSent(true); return }
    const code = ((await res?.json().catch(() => null)) as { code?: string } | null)?.code
    setError(code && ERRORS.includes(code) ? t(`errors.${code}`) : t('errors.generic'))
    botCheck.current?.reset()
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <h1 className="text-2xl font-extrabold text-white mb-2">{t('heading')}</h1>
        {sent ? (
          <p role="status" className="text-slate-200 text-sm leading-relaxed">{t('sent')}</p>
        ) : (
          <>
            <p className="text-slate-300 text-sm mb-6">{t('intro')}</p>
            <form onSubmit={submit} method="post" className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-medium text-slate-300 mb-1">{tLogin('emailLabel')}</label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  name="email"
                  required
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <BotCheck ref={botCheck} onToken={onBotToken} dark />
              {error && <p role="alert" className="text-rose-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading || (BOT_CHECK_ENABLED && !botToken)}
                className="w-full bg-indigo-600 text-white font-bold rounded-xl py-3 hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('submitting') : t('submit')}
              </button>
            </form>
          </>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-semibold text-indigo-300 underline hover:text-indigo-200">{t('back')}</Link>
        </p>
      </div>
    </main>
  )
}
