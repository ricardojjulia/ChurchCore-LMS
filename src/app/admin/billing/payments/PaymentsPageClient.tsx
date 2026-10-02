'use client'

import React, { useState } from 'react'
import { createStripeConnectLink } from '@/app/actions/payments'
import type { CoursePurchase } from '@/lib/payments'

interface Props {
  org: {
    id: string
    name: string
    stripeConnectId: string | null
    stripeConnectStatus: string
  }
  purchases: (CoursePurchase & { course_title?: string })[]
  paidCoursesCount: number
}

export default function PaymentsPageClient({ org, purchases, paidCoursesCount }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConnected = org.stripeConnectStatus === 'active' || Boolean(org.stripeConnectId)
  const totalRevenueCents = purchases
    .filter(p => p.status === 'succeeded')
    .reduce((sum, p) => sum + p.amount_cents, 0)

  const handleConnect = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await createStripeConnectLink(window.location.origin)
      if (!res.success || !res.url) {
        throw new Error(res.error || 'Failed to generate Stripe onboarding link')
      }
      window.location.href = res.url
    } catch (err: any) {
      setError(err?.message || 'Error initiating Stripe connection')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Stripe Connect Account Card */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-2xl">
              💳
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Stripe Connect Payout Account</h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                    isConnected
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}
                >
                  {isConnected ? '✓ Connected' : 'Not Connected'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Option A: Direct Church Payouts. When students purchase course seats, payments flow directly into your church’s Stripe account. ChurchCore LMS takes 0% platform fee.
              </p>
            </div>
          </div>

          <div>
            <button
              onClick={handleConnect}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {loading
                ? 'Redirecting to Stripe…'
                : isConnected
                ? 'Update Stripe Account'
                : 'Connect with Stripe'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
            {error}
          </div>
        )}

        {org.stripeConnectId && (
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Stripe Account ID: <code className="text-slate-300 font-mono">{org.stripeConnectId}</code></span>
            <span>Standard Connected Account (Merchant of Record)</span>
          </div>
        )}
      </div>

      {/* Metrics Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs font-medium text-slate-400">Total Course Sales</span>
          <p className="text-2xl font-bold text-white">
            ${(totalRevenueCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs font-medium text-slate-400">Total Paid Enrollments</span>
          <p className="text-2xl font-bold text-white">
            {purchases.filter(p => p.status === 'succeeded').length}
          </p>
        </div>
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs font-medium text-slate-400">Active Paid Courses</span>
          <p className="text-2xl font-bold text-white">{paidCoursesCount}</p>
        </div>
      </div>

      {/* Recent Purchases Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-white">Recent Transactions</h4>
          <span className="text-xs text-slate-400">{purchases.length} total orders</span>
        </div>

        {purchases.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl">
            <p className="text-xs text-slate-400 italic">No course purchases recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-2">Course</th>
                  <th className="py-3 px-2">Buyer</th>
                  <th className="py-3 px-2">Amount</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {purchases.map(p => (
                  <tr key={p.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-2 font-medium text-white">{p.course_title || 'Course Enrollment'}</td>
                    <td className="py-3 px-2 text-slate-400">{p.buyer_email}</td>
                    <td className="py-3 px-2 font-semibold">
                      ${(p.amount_cents / 100).toFixed(2)} {p.currency.toUpperCase()}
                    </td>
                    <td className="py-3 px-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.status === 'succeeded'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : p.status === 'refunded'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-slate-500">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
