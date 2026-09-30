'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

// Trial countdown for org admins (COUNCIL-2026-034).
export default function TrialBanner({ trialEndsAt }: { trialEndsAt: string }) {
  const t = useTranslations('renew')
  const days = Math.max(0, Math.ceil((Date.parse(trialEndsAt) - Date.now()) / 86_400_000))
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-900">{t('trialBanner', { days })}</p>
      <Link href="/admin/billing" className="text-sm font-semibold text-indigo-800 underline">{t('trialBannerCta')}</Link>
    </div>
  )
}
