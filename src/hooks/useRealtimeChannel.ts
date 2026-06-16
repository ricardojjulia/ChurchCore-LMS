'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseRealtimeChannelOptions {
  channelName: string
  table: string
  schema?: string
  filter?: string
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  onData: (payload: unknown) => void
  onStatusChange?: (status: string) => void
  enabled?: boolean
}

export function useRealtimeChannel({
  channelName,
  table,
  schema = 'public',
  filter,
  event = '*',
  onData,
  onStatusChange,
  enabled = true,
}: UseRealtimeChannelOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as Parameters<ReturnType<typeof supabase.channel>['on']>[0],
        {
          event,
          schema,
          table,
          ...(filter ? { filter } : {}),
        },
        onData,
      )
      .subscribe((status: string) => {
        onStatusChange?.(status)
        if (process.env.NODE_ENV === 'development') {
          console.debug(`[Realtime] ${channelName}: ${status}`)
        }
      })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  // onData and onStatusChange are excluded from deps intentionally —
  // callers should wrap in useCallback to avoid re-subscription churn.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, table, schema, filter, event, enabled])
}
