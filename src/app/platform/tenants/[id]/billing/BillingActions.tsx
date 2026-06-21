'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  orgId:       string
  currentPlan: string
  orgStatus:   string
  priceIds:    { starter: string; growth: string; enterprise: string }
}

const PLANS = [
  { id: 'starter',    label: 'Starter',    description: 'Courses + reporting' },
  { id: 'growth',     label: 'Growth',     description: '+ AI tutor, HQ, Guardian portal' },
  { id: 'enterprise', label: 'Enterprise', description: 'All features + priority support' },
]

export default function BillingActions({ orgId, currentPlan, orgStatus, priceIds }: Props) {
  const router  = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function startCheckout(plan: 'starter' | 'growth' | 'enterprise') {
    setError(null)
    setLoading(true)
    try {
      const priceId = priceIds[plan]
      if (!priceId) {
        setError(`Price ID for "${plan}" is not configured.`)
        return
      }

      const origin     = window.location.origin
      const successUrl = `${origin}/platform/tenants/${orgId}/billing?upgraded=1`
      const cancelUrl  = `${origin}/platform/tenants/${orgId}/billing`

      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, priceId, successUrl, cancelUrl }),
      })

      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Failed to create checkout session.')
        return
      }

      window.location.href = data.url
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="bg-white rounded-xl border p-6 space-y-4">
      <h2 className="text-lg font-semibold">Change plan</h2>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan
          return (
            <div
              key={plan.id}
              className={`flex items-center justify-between rounded-lg border p-4 ${
                isCurrent ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <div>
                <p className="font-medium">{plan.label}</p>
                <p className="text-xs text-muted-foreground">{plan.description}</p>
              </div>
              {isCurrent ? (
                <span className="text-xs text-primary font-semibold">Current plan</span>
              ) : (
                <button
                  onClick={() => startCheckout(plan.id as 'starter' | 'growth' | 'enterprise')}
                  disabled={loading || orgStatus === 'suspended'}
                  className="text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                >
                  {loading ? 'Loading…' : 'Select'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {orgStatus === 'suspended' && (
        <p className="text-sm text-destructive">
          This organization is suspended. Contact support to reactivate.
        </p>
      )}
    </section>
  )
}
