'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

interface OrgBilling {
  id:                 string
  name:               string
  plan:               string
  status:             string
  stripe_customer_id: string | null
}

interface Props {
  org:            OrgBilling
  features:       Record<string, boolean>
  starterPriceId: string
}

const PLAN_LABELS: Record<string, string> = {
  free:       'Free',
  starter:    'Starter',
  growth:     'Growth',
  enterprise: 'Enterprise',
}

const FEATURE_LABELS: Record<string, string> = {
  courses:   'Courses',
  reporting: 'Reporting',
  ai_tutor:  'AI Tutor',
  hq:        'HQ Governance',
  guardian:  'Guardian Portal',
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    suspended: 'bg-red-100 text-red-700',
    trial:     'bg-yellow-100 text-yellow-800',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  )
}

export default function BillingPageClient({ org, features, starterPriceId }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const planLabel = PLAN_LABELS[org.plan] ?? org.plan

  async function handleManageBilling() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Request failed')
      }
      const { url } = await res.json() as { url: string }
      window.location.href = url
    } catch {
      setError('Could not open billing portal. Please try again.')
      setLoading(false)
    }
  }

  async function handleUpgrade() {
    if (!starterPriceId) {
      setError('Upgrade is not available at this time. Please contact support.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          orgId:      org.id,
          priceId:    starterPriceId,
          successUrl: `${window.location.origin}/admin/billing`,
          cancelUrl:  `${window.location.origin}/admin/billing`,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Request failed')
      }
      const { url } = await res.json() as { url: string }
      window.location.href = url
    } catch {
      setError('Could not start the upgrade process. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Suspension banner */}
      {org.status === 'suspended' && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-red-800">Subscription cancelled</p>
            <p className="text-sm text-red-700 mt-0.5">
              Your subscription has been cancelled. Members cannot access the platform.{' '}
              <a
                href="mailto:support@churchcore.app"
                className="underline font-medium"
              >
                Contact support
              </a>{' '}
              to reactivate.
            </p>
          </div>
        </div>
      )}

      {/* Current plan card */}
      <section className="bg-white rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Current Plan</h2>

        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-foreground">{planLabel}</span>
          <StatusChip status={org.status} />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          {Object.entries(features).map(([key, enabled]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              {enabled
                ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />
                : <XCircle    className="h-4 w-4 text-slate-300 shrink-0" aria-hidden="true" />
              }
              <span className={enabled ? 'text-foreground' : 'text-muted-foreground'}>
                {FEATURE_LABELS[key] ?? key.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA card */}
      <section className="bg-white rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {org.stripe_customer_id ? 'Manage Subscription' : 'Upgrade Your Plan'}
        </h2>

        {org.stripe_customer_id ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              View invoices, update your payment method, change plans, or cancel your subscription
              through the Stripe billing portal.
            </p>
            <button
              type="button"
              onClick={handleManageBilling}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Opening portal…' : 'Manage Subscription & Invoices'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You are on the Free plan. Upgrade to Starter to unlock courses, reporting, and more.
            </p>
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Redirecting…' : 'Upgrade Plan'}
            </button>
            <p className="text-xs text-muted-foreground">
              Need help?{' '}
              <a
                href="mailto:support@churchcore.app"
                className="text-primary underline"
              >
                Contact support
              </a>
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600" role="alert">{error}</p>
        )}
      </section>
    </div>
  )
}
