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
    active:    'bg-emerald-950/50 text-emerald-400 border-emerald-800',
    suspended: 'bg-rose-950/50 text-rose-400 border-rose-800',
    trial:     'bg-amber-950/50 text-amber-400 border-amber-800',
  }
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${styles[status] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
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
        <div className="flex items-start gap-3 bg-rose-950/50 border border-rose-800 rounded-2xl px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-rose-300">Subscription cancelled</p>
            <p className="text-sm text-rose-400 mt-0.5">
              Your subscription has been cancelled. Members cannot access the platform.{' '}
              <a
                href="mailto:support@churchcore.app"
                className="underline font-medium text-white hover:text-amber-300"
              >
                Contact support
              </a>{' '}
              to reactivate.
            </p>
          </div>
        </div>
      )}

      {/* Current plan card */}
      <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Current Plan</h2>

        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-white">{planLabel}</span>
          <StatusChip status={org.status} />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          {Object.entries(features).map(([key, enabled]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              {enabled
                ? <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                : <XCircle    className="h-4 w-4 text-slate-600 shrink-0" aria-hidden="true" />
              }
              <span className={enabled ? 'text-slate-200' : 'text-slate-500'}>
                {FEATURE_LABELS[key] ?? key.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA card */}
      <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          {org.stripe_customer_id ? 'Manage Subscription' : 'Upgrade Your Plan'}
        </h2>

        {org.stripe_customer_id ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              View invoices, update your payment method, change plans, or cancel your subscription
              through the Stripe billing portal.
            </p>
            <button
              type="button"
              onClick={handleManageBilling}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl text-sm font-semibold h-10 px-5 bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Opening portal…' : 'Manage Subscription & Invoices'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              You are on the Free plan. Upgrade to Starter to unlock courses, reporting, and more.
            </p>
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl text-sm font-semibold h-10 px-5 bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Redirecting…' : 'Upgrade Plan'}
            </button>
            <p className="text-xs text-slate-400">
              Need help?{' '}
              <a
                href="mailto:support@churchcore.app"
                className="text-indigo-400 hover:text-indigo-300 underline"
              >
                Contact support
              </a>
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-rose-400" role="alert">{error}</p>
        )}
      </section>
    </div>
  )
}
