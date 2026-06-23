'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/hooks/useNotifications'

interface Props {
  userId:    string
  sidebar?:  boolean
  collapsed?: boolean
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function ConnectionDot({ status }: { status: string }) {
  if (status === 'SUBSCRIBED') return null
  if (status === 'CONNECTING' || status === 'CHANNEL_ERROR') {
    return (
      <span
        title={status === 'CONNECTING' ? 'Connecting…' : 'Reconnecting…'}
        className={cn(
          'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-900',
          status === 'CONNECTING' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500',
        )}
      />
    )
  }
  return null
}

export default function NotificationBell({ userId, sidebar = false, collapsed = false }: Props) {
  const [open, setOpen] = useState(false)
  const [prevCount, setPrevCount] = useState<number | null>(null)
  const [badgePulse, setBadgePulse] = useState(false)
  const bellRef  = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const { notifications, unreadCount, connectionStatus, markAsRead, markAllAsRead } =
    useNotifications(userId)

  // Animate badge when unreadCount increments
  useEffect(() => {
    if (prevCount !== null && unreadCount > prevCount) {
      setBadgePulse(true)
      const t = setTimeout(() => setBadgePulse(false), 600)
      return () => clearTimeout(t)
    }
    setPrevCount(unreadCount)
  }, [unreadCount, prevCount])

  // Close on Escape, return focus to bell
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); bellRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="relative">
      <button
        ref={bellRef}
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400',
          sidebar
            ? cn(
                'flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm font-medium',
                'text-slate-400 hover:text-white hover:bg-slate-800',
                collapsed && 'justify-center gap-0',
              )
            : 'flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-700 focus:ring-offset-1 focus:ring-offset-slate-900',
        )}
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
          className={cn(sidebar ? 'w-5 h-5 shrink-0' : 'text-slate-300')}
          width="18"
          height="18"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Label — sidebar expanded only */}
        {sidebar && (
          <span className={cn(
            'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200',
            collapsed ? 'max-w-0 opacity-0' : 'max-w-[120px] opacity-100',
          )}>
            Notifications
          </span>
        )}

        {unreadCount > 0 && (
          <span
            className={cn(
              'min-w-[16px] h-4 px-1 rounded-full',
              'bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none',
              'transition-transform',
              badgePulse && 'scale-125',
              sidebar && !collapsed ? 'ml-auto shrink-0' : 'absolute -top-0.5 -right-0.5',
            )}
            aria-live="polite"
            aria-atomic="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        <ConnectionDot status={connectionStatus} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className={cn(
              'absolute z-50 w-80 bg-white border border-border rounded-2xl shadow-xl overflow-hidden',
              sidebar ? 'bottom-full mb-2 left-0' : 'right-0 top-10',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-bold text-foreground">Notifications</p>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllAsRead()}
                  className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-72 overflow-y-auto divide-y divide-border">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No notifications yet.
                </p>
              ) : (
                notifications.map((n) => {
                  const inner = (
                    <div
                      key={n.id}
                      onClick={() => !n.is_read && markAsRead(n.id)}
                      className={cn(
                        'px-4 py-3 flex gap-3 items-start transition-colors border-l-2',
                        !n.is_read
                          ? 'border-l-primary bg-primary/5 hover:bg-primary/10'
                          : 'border-l-transparent hover:bg-slate-50',
                        n.link && 'cursor-pointer',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1 w-2 h-2 rounded-full shrink-0',
                          !n.is_read ? 'bg-primary' : 'bg-transparent',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-sm leading-snug',
                            !n.is_read
                              ? 'font-semibold text-foreground'
                              : 'text-muted-foreground',
                          )}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {n.body}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>
                  )

                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  )
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
