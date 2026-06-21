'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { sendMessage, markThreadRead, deleteMessage } from '@/app/actions/messages'
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel'
import { cn } from '@/lib/utils'

interface Message {
  id:         string
  thread_id:  string
  sender_id:  string
  body:       string
  is_deleted: boolean
  created_at: string
  profiles?: {
    uid:          string
    display_name: string
  }
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageThread({
  threadId,
  myUid,
  initialMessages,
}: {
  threadId:        string
  myUid:           string
  initialMessages: Message[]
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [body, setBody]         = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [isPending, start]      = useTransition()
  const bottomRef               = useRef<HTMLDivElement>(null)
  const textareaRef             = useRef<HTMLTextAreaElement>(null)

  // Mark thread read on mount
  useEffect(() => { markThreadRead(threadId) }, [threadId])

  // Realtime subscription via shared base hook (cleanup guaranteed on unmount)
  const handleIncoming = useCallback((payload: unknown) => {
    const msg = (payload as { new: Message }).new
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev  // dedup optimistic
      return [...prev, msg]
    })
  }, [])

  useRealtimeChannel({
    channelName: `thread:${threadId}:messages`,
    table: 'messages',
    filter: `thread_id=eq.${threadId}`,
    event: 'INSERT',
    onData: handleIncoming,
  })

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || isPending) return
    setError(null)

    const optimisticId  = `optimistic-${Date.now()}`
    const optimisticMsg: Message = {
      id:         optimisticId,
      thread_id:  threadId,
      sender_id:  myUid,
      body:       body.trim(),
      is_deleted: false,
      created_at: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, optimisticMsg])
    const draft = body.trim()
    setBody('')

    start(async () => {
      const res = await sendMessage(threadId, draft)
      if (res.error) {
        setError(res.error)
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        setBody(draft)
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- handleSend expects FormEvent but is triggered from KeyboardEvent; shape is compatible at runtime
      handleSend(e as any)
    }
  }

  async function handleDelete(messageId: string) {
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, is_deleted: true } : m))
    await deleteMessage(messageId)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            No messages yet. Say hello!
          </p>
        )}

        {messages.map((msg, idx) => {
          const isMe      = msg.sender_id === myUid
          const prevMsg   = messages[idx - 1]
          const sameGroup = prevMsg?.sender_id === msg.sender_id &&
            new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 5 * 60 * 1000

          if (msg.is_deleted) {
            return (
              <div key={msg.id} className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                <span className="text-xs italic text-muted-foreground/60 px-3 py-1">
                  Message deleted
                </span>
              </div>
            )
          }

          return (
            <div
              key={msg.id}
              className={cn('flex group items-end gap-2', isMe ? 'justify-end' : 'justify-start', !sameGroup && 'mt-3')}
            >
              {/* Avatar spacer for non-me, same group */}
              {!isMe && (
                <div className={cn('w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold',
                  sameGroup ? 'invisible' : 'bg-primary/10 text-primary'
                )}>
                  {!sameGroup && (msg.profiles?.display_name?.[0]?.toUpperCase() ?? '?')}
                </div>
              )}

              <div className={cn('max-w-[72%]', isMe && 'items-end flex flex-col')}>
                {!sameGroup && !isMe && msg.profiles && (
                  <p className="text-xs text-muted-foreground mb-1 ml-1">
                    {msg.profiles.display_name}
                  </p>
                )}
                <div className="relative">
                  <div className={cn(
                    'px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words',
                    isMe
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-white border border-border text-foreground rounded-bl-sm shadow-sm'
                  )}>
                    {msg.body}
                  </div>

                  {/* Delete own message */}
                  {isMe && (
                    <button
                      onClick={() => handleDelete(msg.id)}
                      className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-destructive text-xs"
                      title="Delete message"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <p className={cn(
                  'text-[10px] text-muted-foreground/60 mt-0.5',
                  isMe ? 'text-right mr-1' : 'ml-1'
                )}>
                  {timeLabel(msg.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-white px-4 py-3">
        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-2">
            {error}
          </p>
        )}
        <form onSubmit={handleSend} className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a message… (Ctrl+Enter to send)"
            rows={1}
            maxLength={10000}
            className="flex-1 border border-input rounded-xl px-4 py-2.5 text-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none max-h-40 overflow-y-auto"
            style={{ minHeight: '42px' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`
            }}
          />
          <button
            type="submit"
            disabled={isPending || !body.trim()}
            className="shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-all"
            aria-label="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </form>
        <p className="text-[10px] text-muted-foreground/50 mt-1.5 ml-1">Ctrl+Enter to send</p>
      </div>
    </div>
  )
}
