'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Source {
  chunkId:      string
  sourceId:     string
  sourceTitle:  string
  chunkIndex:   number
  sectionCode?: string   // set when chunk comes from a different section (multi-section)
  similarity:   number
}

interface Message {
  role:     'user' | 'assistant'
  text:     string
  sources?: Source[]
  error?:   string
}

interface Props {
  sectionId:    string
  courseId:     string
  courseTitle:  string
  isIndexed:    boolean   // false = embedding_status !== 'complete' for any page
}

export default function TutorChat({ sectionId, courseId, courseTitle, isIndexed }: Props) {
  const [messages,  setMessages]  = useState<Message[]>([])
  const [query,     setQuery]     = useState('')
  const [streaming, setStreaming] = useState(false)
  const [, startTransition]       = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const q = query.trim()
    if (!q || streaming) return

    setQuery('')
    setStreaming(true)

    // Append user message immediately
    setMessages((prev) => [...prev, { role: 'user', text: q }])

    // Placeholder for the assistant response — we'll stream into it
    setMessages((prev) => [...prev, { role: 'assistant', text: '' }])

    try {
      const res = await fetch('/api/ai/tutor', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sectionId, query: q }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role:  'assistant',
            text:  '',
            error: (err as { error?: string }).error ?? 'Something went wrong',
          }
          return updated
        })
        return
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let sources: Source[] | undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text  = decoder.decode(value, { stream: true })
        const lines = text.split('\n').filter((l) => l.startsWith('data: '))

        for (const line of lines) {
          const payload = line.slice(6).trim()
          try {
            const event = JSON.parse(payload) as {
              type: 'context' | 'delta' | 'done' | 'error'
              sources?: Source[]
              text?: string
              message?: string
            }

            if (event.type === 'context') {
              sources = event.sources
            } else if (event.type === 'delta' && event.text) {
              startTransition(() => {
                setMessages((prev) => {
                  const updated = [...prev]
                  const last    = updated[updated.length - 1]
                  updated[updated.length - 1] = { ...last, text: last.text + event.text! }
                  return updated
                })
              })
            } else if (event.type === 'done') {
              // Attach sources to the completed message
              if (sources) {
                setMessages((prev) => {
                  const updated = [...prev]
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    sources,
                  }
                  return updated
                })
              }
            } else if (event.type === 'error') {
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  error: event.message ?? 'Unknown error',
                }
                return updated
              })
            }
          } catch { /* malformed SSE line — skip */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role:  'assistant',
          text:  '',
          error: 'Connection lost. Please try again.',
        }
        return updated
      })
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-5 py-4 shrink-0">
        <h2 className="font-bold text-foreground text-base">AI Tutor</h2>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{courseTitle}</p>
      </div>

      {/* Not-yet-indexed notice */}
      {!isIndexed && (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 shrink-0">
          <p className="font-semibold">Course content is being indexed</p>
          <p className="text-xs mt-0.5">
            The AI tutor will be ready once published pages finish indexing. Check back shortly.
          </p>
        </div>
      )}

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
            <div className="w-12 h-12 rounded-full bg-violet-50 border border-violet-200 flex items-center justify-center text-xl">
              AI
            </div>
            <p className="text-sm font-semibold text-foreground">Ask anything about {courseTitle}</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Your tutor searches the course content to answer questions based on what{`'`}s been published.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : '')}>
            {/* Avatar */}
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-violet-50 border border-violet-200 text-violet-700',
            )}>
              {msg.role === 'user' ? 'You' : 'AI'}
            </div>

            <div className={cn(
              'flex flex-col gap-1.5 max-w-[80%]',
              msg.role === 'user' ? 'items-end' : 'items-start',
            )}>
              {/* Bubble */}
              <div className={cn(
                'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tr-sm'
                  : 'bg-slate-100 text-foreground rounded-tl-sm',
              )}>
                {msg.error ? (
                  <p className="text-rose-600">{msg.error}</p>
                ) : msg.text ? (
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                ) : (
                  // Streaming indicator — pulsing dots
                  <span className="flex gap-1 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                  </span>
                )}
              </div>

              {/* Citations */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  {msg.sources.map((s) => (
                    <Link
                      key={s.chunkId}
                      href={`/courses/${courseId}/pages/${s.sourceId}/edit`}
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded px-2 py-0.5 hover:bg-violet-100 transition-colors"
                      title={`Similarity: ${Math.round(s.similarity * 100)}%`}
                    >
                      <span aria-hidden="true">↗</span>
                      {s.sourceTitle}
                      {s.sectionCode && (
                        <span className="ml-1 text-violet-500 font-mono">{s.sectionCode}</span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border p-4 shrink-0 flex flex-col gap-2"
      >
        <textarea
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question… (⌘↵ to send)"
          rows={2}
          disabled={streaming || !isIndexed}
          className="w-full resize-none text-sm border border-border rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors placeholder:text-muted-foreground/60 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">⌘↵ to send</span>
          <button
            type="submit"
            disabled={streaming || !query.trim() || !isIndexed}
            className="bg-primary text-primary-foreground font-bold px-4 py-1.5 rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {streaming ? 'Thinking…' : 'Ask'}
          </button>
        </div>
      </form>
    </div>
  )
}
