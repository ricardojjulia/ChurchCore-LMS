'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Turnstile } from '@marsidev/react-turnstile'
import { slugify } from '@/lib/signup-slug'

type FieldError = { field: string; code: string } | null

export default function StartForm() {
  const t = useTranslations('signup')
  const [churchName, setChurchName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [email, setEmail] = useState('')
  const [locale, setLocale] = useState<'en' | 'es' | 'pt'>('en')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [error, setError] = useState<FieldError>(null)
  const [pending, setPending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  if (sentTo) {
    return (
      <div role="status" className="mt-6 rounded-2xl border border-emerald-800/80 bg-emerald-950/50 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-emerald-300">{t('sentTitle')}</h2>
        <p className="mt-2 text-sm text-emerald-300">{t('sentBody', { email: sentTo })}</p>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!turnstileToken) { setError({ field: 'form', code: 'turnstile' }); return }
    setPending(true)
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          churchName, slug, adminName, email, locale, turnstileToken,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      if (res.status === 202) { setSentTo(email); return }
      const data = (await res.json().catch(() => ({}))) as { error?: string; field?: string }
      setError({ field: data.field ?? 'form', code: data.error ?? 'generic' })
    } catch {
      setError({ field: 'form', code: 'generic' })
    } finally {
      setPending(false)
    }
  }

  const fieldError = (field: string) =>
    error?.field === field ? (
      <p id={`${field}-error`} role="alert" className="mt-1 text-sm text-rose-400">
        {t.has(`errors.${error.code}`) ? t(`errors.${error.code}`) : t('errors.invalid')}
      </p>
    ) : null
  const describedBy = (field: string) => (error?.field === field ? `${field}-error` : undefined)
  const input = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm" noValidate>
      <div>
        <label htmlFor="churchName" className="mb-1 block text-sm font-semibold text-slate-200">{t('churchName')}</label>
        <input id="churchName" className={input} value={churchName} required maxLength={100}
          aria-describedby={describedBy('churchName')}
          onChange={(e) => { setChurchName(e.target.value); if (!slugEdited) setSlug(slugify(e.target.value)) }} />
        {fieldError('churchName')}
      </div>
      <div>
        <label htmlFor="slug" className="mb-1 block text-sm font-semibold text-slate-200">{t('slug')}</label>
        <input id="slug" className={input} value={slug} required maxLength={40}
          aria-describedby={describedBy('slug') ?? 'slug-hint'}
          onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugEdited(true) }} />
        <p id="slug-hint" className="mt-1 text-xs text-slate-400">{t('slugHint', { url: `/join/${slug || '…'}` })}</p>
        {fieldError('slug')}
      </div>
      <div>
        <label htmlFor="adminName" className="mb-1 block text-sm font-semibold text-slate-200">{t('adminName')}</label>
        <input id="adminName" className={input} value={adminName} required maxLength={100}
          aria-describedby={describedBy('adminName')} onChange={(e) => setAdminName(e.target.value)} />
        {fieldError('adminName')}
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-semibold text-slate-200">{t('email')}</label>
        <input id="email" type="email" className={input} value={email} required autoComplete="email"
          aria-describedby={describedBy('email')} onChange={(e) => setEmail(e.target.value)} />
        {fieldError('email')}
      </div>
      <div>
        <label htmlFor="locale" className="mb-1 block text-sm font-semibold text-slate-200">{t('language')}</label>
        <select id="locale" className={input} value={locale} onChange={(e) => setLocale(e.target.value as 'en' | 'es' | 'pt')}>
          <option value="en" className="bg-slate-800 text-white">English</option>
          <option value="es" className="bg-slate-800 text-white">Español</option>
          <option value="pt" className="bg-slate-800 text-white">Português</option>
        </select>
      </div>
      <Turnstile siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''} onSuccess={setTurnstileToken} />
      {fieldError('form')}
      <button type="submit" disabled={pending}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors">
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
