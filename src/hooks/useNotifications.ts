'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRealtimeChannel } from './useRealtimeChannel'

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<string>('CONNECTING')
  const supabase = createClient()

  // Initial fetch
  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }

    const fetch = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (!error && data) {
        setNotifications(data as Notification[])
        setUnreadCount((data as Notification[]).filter((n) => !n.is_read).length)
      }
      setLoading(false)
    }

    fetch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const handleNewNotification = useCallback((payload: unknown) => {
    const incoming = (payload as { new: Notification }).new
    setNotifications((prev) => [incoming, ...prev])
    setUnreadCount((prev) => prev + 1)
  }, [])

  useRealtimeChannel({
    channelName: `notifications:${userId}`,
    table: 'notifications',
    filter: userId ? `user_id=eq.${userId}` : undefined,
    event: 'INSERT',
    onData: handleNewNotification,
    onStatusChange: setConnectionStatus,
    enabled: !!userId,
  })

  const markAsRead = useCallback(
    async (notificationId: string) => {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId)

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)),
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const markAllAsRead = useCallback(
    async () => {
      if (!userId) return
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false)

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  )

  return {
    notifications,
    unreadCount,
    loading,
    connectionStatus,
    markAsRead,
    markAllAsRead,
  }
}
