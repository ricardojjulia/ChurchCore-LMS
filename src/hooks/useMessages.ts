'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRealtimeChannel } from './useRealtimeChannel'

export interface Message {
  id: string
  thread_id: string
  sender_id: string
  body: string
  is_deleted: boolean
  created_at: string
  profiles?: {
    uid: string
    display_name: string
  }
}

export function useMessages(threadId: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const isAtBottomRef = useRef(true)
  const supabase = createClient()

  useEffect(() => {
    if (!threadId) {
      setLoading(false)
      return
    }

    const fetch = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles!sender_id(uid, display_name)')
        .eq('thread_id', threadId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(100)

      if (!error && data) {
        setMessages(data as Message[])
      }
      setLoading(false)
    }

    fetch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  const handleNewMessage = useCallback((payload: unknown) => {
    const incoming = (payload as { new: Message }).new
    setMessages((prev) => [...prev, incoming])
  }, [])

  useRealtimeChannel({
    channelName: `messages:${threadId}`,
    table: 'messages',
    filter: threadId ? `thread_id=eq.${threadId}` : undefined,
    event: 'INSERT',
    onData: handleNewMessage,
    enabled: !!threadId,
  })

  return { messages, loading, isAtBottomRef }
}
