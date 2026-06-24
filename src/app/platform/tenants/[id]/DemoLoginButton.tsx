'use client'

import { useTransition } from 'react'
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

  function handleClick() {
    start(async () => {
      const result = await generateDemoLoginLink(orgId, email)
      if ('url' in result) {
        window.open(result.url, '_blank', 'noopener,noreferrer')
      } else {
        alert(`Could not generate login link: ${result.error}`)
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded border border-indigo-700 px-3 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-900/30 disabled:opacity-40 transition-colors"
    >
      {pending ? 'Generating…' : `↗ ${label}`}
    </button>
  )
}
