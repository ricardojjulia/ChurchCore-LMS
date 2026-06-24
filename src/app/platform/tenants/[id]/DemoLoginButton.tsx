'use client'

import { useState, useTransition } from 'react'
import { generateDemoLoginLink } from '../../actions'

export default function DemoLoginButton({
  orgId,
  email,
  label,
}: {
  orgId:  string
  email:  string
  label:  string
}) {
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)

  function handleGenerate() {
    start(async () => {
      const result = await generateDemoLoginLink(orgId, email)
      if ('url' in result) {
        setLoginUrl(result.url)
      } else {
        alert(`Could not generate login link: ${result.error}`)
      }
    })
  }

  function handleCopy() {
    if (!loginUrl) return
    navigator.clipboard.writeText(loginUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loginUrl) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 italic">Paste in a private/incognito window →</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={() => setLoginUrl(null)}
          className="text-xs text-slate-600 hover:text-slate-400"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded border border-indigo-700 px-3 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-900/30 disabled:opacity-40 transition-colors"
    >
      {pending ? 'Generating…' : `↗ ${label}`}
    </button>
  )
}
