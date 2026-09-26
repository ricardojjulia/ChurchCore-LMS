'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { publishAnnouncement } from '@/app/actions/announcements'

// Publishes a saved draft in place. (The drafts list previously linked to
// /announcements/new?edit=<id>, which the form never supported — drafts could
// not be published at all.)
export default function PublishDraftButton({ id, label }: { id: string; label: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="flex items-center gap-2 shrink-0">
      {error && <span role="alert" className="text-xs text-rose-600">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const res = await publishAnnouncement(id)
          if (res.error) setError(res.error)
          else router.refresh()
        })}
        className="text-xs text-primary font-medium hover:underline disabled:opacity-50"
      >
        {label}
      </button>
    </span>
  )
}
