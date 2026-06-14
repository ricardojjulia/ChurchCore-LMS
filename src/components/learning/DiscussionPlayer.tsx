'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

interface Reply {
  submission_id: string
  user_id:       string
  display_name:  string | null
  content:       { text?: string; edited_at?: string }
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
  blockId:       string
  prompt?:       string
  ownReplyText?: string | null
}) {
  const [replies,    setReplies]    = useState<Reply[]>([])
  const [loading,    setLoading]    = useState(true)
  const [text,       setText]       = useState('')
  const [error,      setError]      = useState<string | null>(null)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editText,   setEditText]   = useState('')
  const [pending,    startPost]     = useTransition()
  const [editPending, startEdit]    = useTransition()
  const bottomRef                   = useRef<HTMLDivElement>(null)
  const supabase                    = createClient()

  async function loadReplies() {
    const { data } = await supabase.rpc('get_block_discussion_replies', { p_block_id: blockId })
    setReplies((data as Reply[]) ?? [])
  }

  useEffect(() => {
    let mounted = true
    loadReplies().then(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await loadReplies()
      setText('')
    })
  }

  function startEditing(reply: Reply) {
    setEditingId(reply.submission_id)
    setEditText(reply.content?.text ?? '')
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditText('')
  }

  function saveEdit(submissionId: string) {
    const trimmed = editText.trim()
    if (!trimmed || trimmed.length < 2) return
    startEdit(async () => {
      const { error: err } = await supabase.rpc('edit_discussion_reply', {
        p_submission_id: submissionId,
        p_text:          trimmed,
      })
      if (err) { setError(err.message); return }
      setEditingId(null)
      await loadReplies()
    })
  }

  function deleteReply(submissionId: string) {
    if (!confirm('Delete your reply? This cannot be undone.')) return
    startEdit(async () => {
      const { error: err } = await supabase.rpc('delete_discussion_reply', {
        p_submission_id: submissionId,
      })
      if (err) { setError(err.message); return }
      setReplies((prev) => prev.filter((r) => r.submission_id !== submissionId))
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
          {replies.some((r) => r.is_own) && (
            <span className="text-xs text-muted-foreground">✓ You replied</span>
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
          <>
          <ul className="divide-y divide-border max-h-96 overflow-y-auto" aria-label="Discussion replies">
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
                    {r.content?.edited_at && (
                      <span className="text-[10px] text-muted-foreground italic shrink-0">edited</span>
                    )}
                  </div>

                  {editingId === r.submission_id ? (
                    <div className="space-y-2 mt-1">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        aria-label="Edit your reply"
                        placeholder="Edit your reply…"
                        className="w-full px-3 py-2 text-sm bg-white border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => saveEdit(r.submission_id)}
                          disabled={editPending || editText.trim().length < 2}
                          className="text-xs font-semibold text-white bg-primary px-3 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
                        >
                          {editPending ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {r.content?.text ?? ''}
                      </p>
                      {r.is_own && (
                        <div className="flex items-center gap-3 mt-2">
                          <button
                            type="button"
                            onClick={() => startEditing(r)}
                            className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteReply(r.submission_id)}
                            className="text-xs text-muted-foreground hover:text-rose-600 transition-colors font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div ref={bottomRef} aria-hidden="true" />
          </>
        )}
      </div>

      {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}

      {/* Reply form */}
      {alreadyPosted ? (
        <p className="text-xs text-muted-foreground text-center italic">
          You&apos;ve replied — use Edit above to update your post.
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
