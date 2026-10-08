'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { enrollSelf } from '@/app/actions/learning'
import { createCoursePurchaseCheckout } from '@/app/actions/payments'

export default function EnrollButton({
  courseId,
  locked = false,
  lockReason,
  priceCents = 0,
  currency = 'usd',
}: {
  courseId:    string
  locked?:     boolean
  lockReason?: string
  priceCents?: number | null
  currency?:   string | null
}) {
  const t                   = useTranslations()
  const [error, setError]   = useState<string | null>(null)
  const [pending, start]    = useTransition()
  const router              = useRouter()

  const isPaid = typeof priceCents === 'number' && priceCents > 0
  const formattedPrice = isPaid
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: (currency || 'usd').toUpperCase(),
      }).format(priceCents / 100)
    : null

  if (locked) {
    return (
      <div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex items-center gap-2 bg-slate-200 text-slate-500 font-bold px-6 py-3 rounded-xl cursor-not-allowed text-sm"
        >
          {t('learning.enroll.lockedButton')}
        </button>
        {lockReason && (
          <p className="text-xs text-slate-500 mt-2">{lockReason}</p>
        )}
      </div>
    )
  }

  async function handleEnroll() {
    setError(null)
    start(async () => {
      if (isPaid) {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        const res = await createCoursePurchaseCheckout({ courseId, origin })
        if (!res.success || !res.url) {
          setError(res.error || 'Failed to start payment checkout.')
        } else {
          window.location.href = res.url
        }
        return
      }

      const res = await enrollSelf(courseId)
      if (res.error) {
        setError(res.error === 'Already enrolled' ? t('learning.enroll.alreadyEnrolledError') : res.error)
      } else {
        router.push(`/courses/${courseId}/learn`)
        router.refresh()
      }
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleEnroll}
        disabled={pending}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm shadow-sm"
        aria-label={t('learning.enroll.ariaLabel')}
      >
        {pending
          ? t('learning.enroll.loadingButton')
          : isPaid
          ? `Buy Course — ${formattedPrice}`
          : t('learning.enroll.ctaButton')}
      </button>
      {error && <p className="text-sm text-rose-600 mt-2" role="alert">{error}</p>}
    </div>
  )
}

