'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { createClient } from '@/utils/supabase/client'

interface NotificationItem {
  id:           string
  type:         string
  title:        string
  body:         string | null
  link:         string | null
  is_read:      boolean
  is_dismissed: boolean
  created_at:   string
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  const d = Math.floor(s / 86400)
  if (d < 7)     return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const TYPE_ICON: Record<string, string> = {
  grade_posted:        '📊',
  assignment_graded:   '✅',
  message_received:    '💬',
  announcement:        '📢',
  course_enrollment:   '🎓',
  certificate_earned:  '🏆',
  assignment_due_soon: '⏰',
  system:              'ℹ️',
}

export default function NotificationsClient({
  initialItems,
  userId,
}: {
  initialItems: NotificationItem[]
  userId:       string
}) {
  const [items,      setItems]      = useState(initialItems)
  const [filter,     setFilter]     = useState<'all' | 'unread'>('all')
  const [, start] = useTransition()

  const supabase = createClient()

  const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id)

  async function markAllRead() {
    if (unreadIds.length === 0) return
    start(async () => {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', unreadIds)
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    })
  }

  async function markRead(id: string) {
    start(async () => {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
      setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
    })
  }

  async function dismiss(id: string) {
    start(async () => {
      await supabase
        .from('notifications')
        .update({ is_dismissed: true, is_read: true })
        .eq('id', id)
      setItems((prev) => prev.filter((n) => n.id !== id))
    })
  }

  const displayed = filter === 'unread'
    ? items.filter((n) => !n.is_read)
    : items

  if (items.length === 0) {
    return (
      <div className="bg-white border border-border rounded-xl p-12 text-center">
        <p className="text-4xl mb-3">🔔</p>
        <p className="text-muted-foreground italic">You're all caught up — no notifications.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors capitalize',
                filter === f
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-white border-border text-muted-foreground hover:border-primary/40'
              )}
            >
              {f}
              {f === 'unread' && unreadIds.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold">
                  {unreadIds.length}
                </span>
              )}
            </button>
          ))}
        </div>
        {unreadIds.length > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      {displayed.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground italic text-sm">No unread notifications.</p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden divide-y divide-border">
          {displayed.map((n) => {
            const icon = TYPE_ICON[n.type] ?? '🔔'
            const inner = (
              <div
                className={cn(
                  'flex items-start gap-4 px-5 py-4 transition-colors group',
                  !n.is_read ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-slate-50/80'
                )}
                onClick={() => { if (!n.is_read) markRead(n.id) }}
              >
                <span className="text-xl mt-0.5 shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn(
                      'text-sm leading-snug',
                      !n.is_read ? 'font-semibold text-foreground' : 'text-foreground/80'
                    )}>
                      {n.title}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      )}
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismiss(n.id) }}
                        className="text-slate-300 hover:text-slate-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 text-xs leading-none"
                        aria-label="Dismiss notification"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {n.body && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                  )}
                  <p className="text-xs text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            )

            return n.link ? (
              <Link key={n.id} href={n.link} className="block">
                {inner}
              </Link>
            ) : (
              <div key={n.id} className="cursor-default">
                {inner}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
