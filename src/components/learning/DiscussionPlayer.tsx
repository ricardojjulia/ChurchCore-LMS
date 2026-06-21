'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { gradeDiscussionSubmission } from '@/app/actions/learning'

interface Reply {
  submission_id: string
  user_id:       string
  display_name:  string | null
  content:       { text?: string; edited_at?: string }
  submitted_at:  string
  is_own:        boolean
  // Grade fields merged from block_submissions after load
  score?:        number | null
  max_score?:    number | null
  status?:       string | null
  graded_at?:    string | null
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── GradeForm subcomponent ────────────────────────────────────────────────────

function GradeForm({
  submissionId,
  existingScore,
  existingMaxScore,
  onSave,
  onCancel,
}: {
  submissionId:     string
  existingScore:    number | null
  existingMaxScore: number
  onSave:           (score: number, maxScore: number) => void
  onCancel:         () => void
}) {
  const [score,    setScore]    = useState(existingScore ?? 0)
  const [maxScore, setMaxScore] = useState(existingMaxScore)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await gradeDiscussionSubmission({ submissionId, score, maxScore })
    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      onSave(score, maxScore)
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex gap-2 items-center flex-wrap">
        <label className="text-xs text-muted-foreground">Score</label>
        <input
          type="number"
          min={0}
          max={maxScore}
          step={0.5}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="w-20 border border-border rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Score"
        />
        <label className="text-xs text-muted-foreground">/ Max</label>
        <input
          type="number"
          min={1}
          step={1}
          value={maxScore}
          onChange={(e) => setMaxScore(Number(e.target.value))}
          className="w-20 border border-border rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Max score"
        />
      </div>
      {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-primary text-white px-3 py-1 rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Grade'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── DiscussionPlayer ──────────────────────────────────────────────────────────

export default function DiscussionPlayer({
  blockId,
  prompt,
  ownReplyText,
  viewerRole,
  maxScore,
}: {
  blockId:       string
  prompt?:       string
  ownReplyText?: string | null
  viewerRole?:   string
  maxScore?:     number
}) {
  const [replies,     setReplies]     = useState<Reply[]>([])
  const [loading,     setLoading]     = useState(true)
  const [text,        setText]        = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editText,    setEditText]    = useState('')
  const [gradingId,   setGradingId]   = useState<string | null>(null)
  const [pending,     startPost]      = useTransition()
  const [editPending, startEdit]      = useTransition()
  const bottomRef                     = useRef<HTMLDivElement>(null)
  const supabase                      = createClient()

  const canGrade         = ['admin', 'manager', 'teacher'].includes(viewerRole ?? '')
  const effectiveMaxScore = maxScore ?? 10

  async function loadReplies() {
    const { data: rpcData } = await supabase.rpc('get_block_discussion_replies', { p_block_id: blockId })
    const base = (rpcData as Reply[]) ?? []

    // The RPC does not return score/max_score/status/graded_at — fetch them separately.
    // RLS ensures teachers see all rows and students see only their own.
    const { data: gradeData } = await supabase
      .from('block_submissions')
      .select('id, score, max_score, status, graded_at')
      .eq('block_id', blockId)

    if (gradeData && gradeData.length > 0) {
      const gradeMap = new Map(gradeData.map((g) => [g.id as string, g]))
      const merged = base.map((r) => {
        const g = gradeMap.get(r.submission_id)
        if (!g) return r
        return {
          ...r,
          score:      g.score      as number | null,
          max_score:  g.max_score  as number | null,
          status:     g.status     as string | null,
          graded_at:  g.graded_at  as string | null,
        }
      })
      setReplies(merged)
    } else {
      setReplies(base)
    }
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

                      {/* Teacher grade controls */}
                      {canGrade && (
                        gradingId === r.submission_id ? (
                          <GradeForm
                            submissionId={r.submission_id}
                            existingScore={r.score ?? null}
                            existingMaxScore={r.max_score ?? effectiveMaxScore}
                            onSave={() => {
                              setGradingId(null)
                              loadReplies()
                            }}
                            onCancel={() => setGradingId(null)}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setGradingId(r.submission_id)}
                            className="text-xs text-primary hover:underline mt-1"
                          >
                            {r.score != null
                              ? `Graded: ${r.score}/${r.max_score ?? effectiveMaxScore} — Edit`
                              : 'Grade'}
                          </button>
                        )
                      )}

                      {/* Student: show own grade */}
                      {r.is_own && r.score != null && !canGrade && (
                        <p className="text-xs text-emerald-700 mt-1 font-medium">
                          Grade: {r.score} / {r.max_score ?? effectiveMaxScore}
                        </p>
                      )}

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
