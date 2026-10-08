'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { updateCoursePricing } from '@/app/actions/payments'

interface CoursePricingFormProps {
  courseId: string
  initialPriceCents?: number | null
  initialCurrency?: string | null
  initialSeatLimit?: number | null
  stripeConnectStatus?: string | null
}

const SUPPORTED_CURRENCIES = [
  { code: 'usd', label: 'USD ($)', symbol: '$' },
  { code: 'eur', label: 'EUR (€)', symbol: '€' },
  { code: 'brl', label: 'BRL (R$)', symbol: 'R$' },
  { code: 'gbp', label: 'GBP (£)', symbol: '£' },
  { code: 'cad', label: 'CAD ($)', symbol: 'CA$' },
]

export default function CoursePricingForm({
  courseId,
  initialPriceCents = 0,
  initialCurrency = 'usd',
  initialSeatLimit = null,
  stripeConnectStatus,
}: CoursePricingFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  // Format initial cents to dollars string (e.g. 4900 -> 49.00, 0 -> 0)
  const initialDollars = initialPriceCents && initialPriceCents > 0 
    ? (initialPriceCents / 100).toString() 
    : '0'

  const [price, setPrice] = useState<string>(initialDollars)
  const [currency, setCurrency] = useState<string>(initialCurrency || 'usd')
  const [seatLimit, setSeatLimit] = useState<string>(initialSeatLimit ? initialSeatLimit.toString() : '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<boolean>(false)

  const isFree = parseFloat(price) === 0 || !price

  const handleSave = () => {
    setError(null)
    setSuccess(false)

    const numPrice = parseFloat(price)
    if (isNaN(numPrice) || numPrice < 0) {
      setError('Please enter a valid non-negative price.')
      return
    }

    const priceCents = Math.round(numPrice * 100)
    const parsedSeatLimit = seatLimit.trim() ? parseInt(seatLimit, 10) : null

    if (parsedSeatLimit !== null && (isNaN(parsedSeatLimit) || parsedSeatLimit < 1)) {
      setError('Seat limit must be a positive integer or left blank.')
      return
    }

    startTransition(async () => {
      const res = await updateCoursePricing({
        courseId,
        priceCents,
        currency,
        seatLimit: parsedSeatLimit,
      })

      if (!res.success) {
        setError(res.error || 'Failed to update pricing settings.')
      } else {
        setSuccess(true)
        router.refresh()
        setTimeout(() => setSuccess(false), 3000)
      }
    })
  }

  return (
    <div className="card-crisp p-8 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🏷️</span> Course Pricing & Storefront
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Set an enrollment price and seat capacity for this course. Paid courses require Stripe Connect for direct church payouts.
          </p>
        </div>
        {stripeConnectStatus === 'active' ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/70 border border-emerald-800/80 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Stripe Connected
          </span>
        ) : (
          <Link
            href="/admin/billing/payments"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/70 border border-amber-800/80 text-amber-300 hover:bg-amber-900/50 transition-colors"
          >
            <span>⚠️ Connect Stripe</span>
          </Link>
        )}
      </div>

      {!isFree && stripeConnectStatus !== 'active' && (
        <div className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200/90 flex items-start gap-3">
          <span className="text-lg">💡</span>
          <div>
            <strong className="font-semibold text-amber-100">Stripe Connect Not Active:</strong> To accept payments for this course, your church administrator must connect a Stripe account in{' '}
            <Link href="/admin/billing/payments" className="underline font-bold text-amber-300 hover:text-white">
              Storefront & Payouts Settings
            </Link>
            .
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Price Input */}
        <div>
          <label htmlFor="course-price" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            Enrollment Price
          </label>
          <div className="relative rounded-xl shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="text-slate-400 text-sm font-semibold">
                {SUPPORTED_CURRENCIES.find((c) => c.code === currency)?.symbol || '$'}
              </span>
            </div>
            <input
              type="number"
              id="course-price"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="block w-full rounded-xl bg-slate-900 border border-slate-700/80 pl-8 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {isFree ? 'Free course (standard self-enroll)' : 'Paid course (requires Stripe checkout)'}
          </span>
        </div>

        {/* Currency Select */}
        <div>
          <label htmlFor="course-currency" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            Currency
          </label>
          <select
            id="course-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="block w-full rounded-xl bg-slate-900 border border-slate-700/80 px-3 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-400 mt-1 block">Payout currency</span>
        </div>

        {/* Seat Limit Input */}
        <div>
          <label htmlFor="course-seat-limit" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            Seat Capacity (Optional)
          </label>
          <input
            type="number"
            id="course-seat-limit"
            min="1"
            step="1"
            value={seatLimit}
            onChange={(e) => setSeatLimit(e.target.value)}
            placeholder="Unlimited"
            className="block w-full rounded-xl bg-slate-900 border border-slate-700/80 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
          <span className="text-[11px] text-slate-400 mt-1 block">
            Max students (blocks checkout when reached)
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 mb-4 rounded-xl bg-rose-950/50 border border-rose-800/80 text-xs text-rose-300">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 mb-4 rounded-xl bg-emerald-950/50 border border-emerald-800/80 text-xs text-emerald-300">
          ✓ Course pricing updated successfully.
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-50 shadow-sm"
        >
          {isPending ? 'Saving...' : 'Save Pricing'}
        </button>
      </div>
    </div>
  )
}
