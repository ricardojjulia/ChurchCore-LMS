'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

interface Reply {
  submission_id: string
  user_id:       string
  display_name:  string | null
  content:       { text?: string }
  submitted_at:  string
  is_own:        boolean
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function DiscussionPlayer({
  blockId,
  prompt,
  ownReplyText,
}: {
  blockId:      string
  prompt?:      string
  ownReplyText?: string | null
}) {
  const [replies,  setReplies]  = useState<Reply[]>([])
  const [loading,  setLoading]  = useState(true)
  const [text,     setText]     = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [pending,  startPost]   = useTransition()
  const bottomRef              = useRef<HTMLDivElement>(null)
  const supabase               = createClient()

  useEffect(() => {
    let mounted = true
    supabase.rpc('get_block_discussion_replies', { p_block_id: blockId })
      .then(({ data }) => {
        if (mounted) {
          setReplies((data as Reply[]) ?? [])
          setLoading(false)
        }
      })
    return () => { mounted = false }
  }, [blockId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [replies.length])

  function post(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || trimmed.length < 2) return
    setError(null)

    startPost(async () => {
      const { error: err } = await supabase
        .from('block_submissions')
        .insert({
          block_id:     blockId,
          status:       'submitted',
          content:      { text: trimmed, type: 'discussion' },
          submitted_at: new Date().toISOString(),
        })

      if (err) { setError(err.message); return }

      // Refresh replies
      const { data } = await supabase.rpc('get_block_discussion_replies', { p_block_id: blockId })
      setReplies((data as Reply[]) ?? [])
      setText('')
    })
  }

  const alreadyPosted = replies.some((r) => r.is_own)

  return (
    <div className="space-y-4">
      {/* Prompt card */}
      {prompt && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4">
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1.5">Discussion Prompt</p>
          <p className="text-sm text-indigo-800 leading-relaxed whitespace-pre-wrap">{prompt}</p>
        </div>
      )}

      {/* Replies */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            {loading ? 'Loading…' : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
          </p>
          {replies.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {replies.filter((r) => r.is_own).length > 0 ? '✓ You replied' : ''}
            </span>
          )}
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center">
            <div className="inline-block w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : replies.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground italic">Be the first to reply.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border max-h-80 overflow-y-auto">
            {replies.map((r) => (
              <li
                key={r.submission_id}
                className={`px-5 py-4 flex gap-3 ${r.is_own ? 'bg-primary/5' : ''}`}
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-indigo-700">
                    {(r.display_name ?? '?')[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {r.display_name ?? 'Student'}
                      {r.is_own && <span className="ml-1 text-[10px] text-primary font-bold">(you)</span>}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{timeAgo(r.submitted_at)}</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {r.content?.text ?? ''}
                  </p>
                </div>
              </li>
            ))}
            <div ref={bottomRef} />
          </ul>
        )}
      </div>

      {/* Reply form */}
      {alreadyPosted ? (
        <p className="text-xs text-muted-foreground text-center italic">
          You&apos;ve already posted a reply to this discussion.
        </p>
      ) : (
        <form onSubmit={post} className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Share your thoughts…"
            className="w-full px-4 py-3 text-sm bg-white border border-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
          />
          {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{text.length}/2000</span>
            <button
              type="submit"
              disabled={pending || text.trim().length < 2}
              className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {pending ? 'Posting…' : 'Post reply'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
