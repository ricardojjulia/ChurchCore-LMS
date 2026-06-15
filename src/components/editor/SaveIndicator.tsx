'use client'

import { useEffect, useState } from 'react'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 5)   return 'just now'
  if (s < 60)  return `${s}s ago`
  if (s < 120) return '1 min ago'
  return `${Math.floor(s / 60)} min ago`
}

export default function SaveIndicator({
  state,
  lastSaved,
}: {
  state:      SaveState
  lastSaved:  Date | null
}) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (state !== 'saved' || !lastSaved) return
    const id = setInterval(() => setTick((t) => t + 1), 10_000)
    return () => clearInterval(id)
  }, [state, lastSaved])

  if (state === 'idle')   return null

  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        Saving…
      </span>
    )
  }

  if (state === 'error') {
    return (
      <span className="text-xs text-rose-600 font-medium">
        ✕ Save failed — check connection
      </span>
    )
  }

  return (
    <span className="text-xs text-emerald-600 font-medium" key={tick}>
      ✓ Saved {lastSaved ? timeAgo(lastSaved) : ''}
    </span>
  )
}
