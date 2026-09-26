'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export default function RenewPlans({ plans }: { plans: Array<{ id: string; priceId: string }> }) {
  const t = useTranslations('renew')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (plans.length === 0) return <p className="mt-6 text-sm text-slate-700">{t('noPlans')}</p>

  async function choose(priceId: string, id: string) {
    setError(null)
    setPending(id)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priceId, successUrl: '/dashboard?upgraded=1', cancelUrl: '/billing/renew' }),
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string }
      if (res.ok && data.url) { window.location.href = data.url; return }
      setError(t('checkoutError'))
    } catch {
      setError(t('checkoutError'))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="mt-6 space-y-3">
      {plans.map((plan) => (
        <button
          key={plan.id}
          type="button"
          disabled={pending !== null}
          onClick={() => choose(plan.priceId, plan.id)}
          className="flex w-full items-center justify-between rounded-xl border border-border px-5 py-4 text-left hover:border-indigo-400 disabled:opacity-60"
        >
          <span className="font-semibold text-foreground">{t(`plan.${plan.id}`)}</span>
          <span className="text-sm font-semibold text-indigo-700">{pending === plan.id ? t('redirecting') : t('choose')}</span>
        </button>
      ))}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </div>
  )
}
