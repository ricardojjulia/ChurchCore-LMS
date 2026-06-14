'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { createClient } from '@/utils/supabase/client'

interface Notification {
  id:         string
  type:       string
  title:      string
  body:       string | null
  link:       string | null
  is_read:    boolean
  created_at: string
}

interface Props {
  initialCount:         number
  initialNotifications: Notification[]
  userId:               string
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)   return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function NotificationBell({ initialCount, initialNotifications, userId }: Props) {
  const [open,  setOpen]  = useState(false)
  const [count, setCount] = useState(initialCount)
  const [items, setItems] = useState(initialNotifications)
  const [, start] = useTransition()
  const bellRef   = useRef<HTMLButtonElement>(null)
  const panelRef  = useRef<HTMLDivElement>(null)

  const supabase = createClient()

  // Close on Escape, return focus to bell
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); bellRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  async function markAllRead() {
    start(async () => {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false)
      setCount(0)
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    })
  }

  async function markRead(id: string) {
    start(async () => {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
      setCount((c) => Math.max(0, c - 1))
      setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
    })
  }

  return (
    <div className="relative">
      <button
        ref={bellRef}
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}
        aria-expanded={open ? 'true' : 'false'}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 focus:ring-offset-slate-900 transition-colors"
      >
        {/* Bell icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4.5 h-4.5 text-slate-300"
          width="18" height="18"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none"
            aria-live="polite"
            aria-atomic="true"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="absolute right-0 top-10 z-50 w-80 bg-white border border-border rounded-2xl shadow-xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-bold text-foreground">Notifications</p>
              {count > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-72 overflow-y-auto divide-y divide-border">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No notifications yet.
                </p>
              ) : (
                items.map((n) => {
                  const inner = (
                    <div
                      key={n.id}
                      onClick={() => !n.is_read && markRead(n.id)}
                      className={cn(
                        'px-4 py-3 flex gap-3 items-start transition-colors',
                        !n.is_read ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-slate-50',
                        n.link && 'cursor-pointer'
                      )}
                    >
                      <span className={cn(
                        'mt-1 w-2 h-2 rounded-full shrink-0',
                        !n.is_read ? 'bg-primary' : 'bg-transparent'
                      )} />
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'text-sm leading-snug',
                          !n.is_read ? 'font-semibold text-foreground' : 'text-muted-foreground'
                        )}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                        <p className="text-xs text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  )

                  return n.link
                    ? <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>{inner}</Link>
                    : <div key={n.id}>{inner}</div>
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-2.5 text-center">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                See all notifications →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
