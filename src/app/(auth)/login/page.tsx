'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import SsoButtons from '@/components/auth/SsoButtons'

const POLICY_ERRORS = ['sso_required', 'domain_not_allowed', 'password_disabled', 'auth_callback_failed']

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const t = useTranslations()

  // Reasons a session was ended or a sign-in didn't finish (COUNCIL-2026-037).
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('error')
    if (reason && POLICY_ERRORS.includes(reason)) setError(t(`auth.sso.errors.${reason}`))
  }, [t])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
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
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-slate-300 mb-1">{t('auth.login.emailLabel')}</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="••••••••"
            />
          </div>
          {error && <p role="alert" className="text-rose-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
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
