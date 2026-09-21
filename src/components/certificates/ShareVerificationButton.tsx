'use client'

import { useState } from 'react'

interface Props {
  certNo: string
}

export function ShareVerificationButton({ certNo }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin
    const url  = `${base}/verify/${certNo}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Graceful fallback: open verification page in a new tab
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy /verify/${certNo}`}
      aria-label="Copy verification link"
      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-500 transition-colors"
    >
      {copied ? (
        <>
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Share
        </>
      )}
    </button>
  )
}
