'use client'

import { useTransition } from 'react'
import { markAnnouncementRead } from '@/app/actions/announcements'

export default function MarkReadButton({ announcementId }: { announcementId: string }) {
  const [isPending, start] = useTransition()

  return (
    <button
      onClick={() => start(() => markAnnouncementRead(announcementId))}
      disabled={isPending}
      className="text-xs text-primary font-medium hover:underline disabled:opacity-50 transition-opacity"
    >
      {isPending ? 'Marking…' : 'Mark read'}
    </button>
  )
}
