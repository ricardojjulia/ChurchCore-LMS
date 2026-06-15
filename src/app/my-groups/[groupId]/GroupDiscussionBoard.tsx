'use client'

import { useState, useTransition, useEffect } from 'react'
import { createThread, postToThread, softDeletePost } from '@/app/actions/groups'
import { createClient } from '@/utils/supabase/client'
import DiscussionEditor from '@/components/editor/DiscussionEditor'

interface Thread {
  id: string
  title: string
  is_pinned: boolean
  is_locked: boolean
  created_at: string
  created_by: string
}

interface Post {
  post_id: string
  author_id: string
  display_name: string
  body: string
  is_own: boolean
  created_at: string
  updated_at: string
}

interface Props {
  groupId:        string
  uid:            string
  displayName:    string
  initialThreads: Thread[]
  isLocked:       boolean
}

export default function GroupDiscussionBoard({
  groupId, uid, displayName, initialThreads,
}: Props) {
  const [threads,       setThreads]      = useState<Thread[]>(initialThreads)
  const [activeThread,  setActiveThread] = useState<string | null>(threads[0]?.id ?? null)
  const [posts,         setPosts]        = useState<Post[]>([])
  const [newTitle,      setNewTitle]     = useState('')
  const [showNewThread, setShowNewThread] = useState(false)
  const [threadErr,     setThreadErr]    = useState<string | null>(null)
  const [postErr,       setPostErr]      = useState<string | null>(null)
  const [pending,       start]           = useTransition()

  const supabase = createClient()

  // Load posts for active thread
  useEffect(() => {
    if (!activeThread) { setPosts([]); return }

    supabase.rpc('get_group_thread_posts', { p_thread_id: activeThread })
      .then(({ data }) => { if (data) setPosts(data as Post[]) })
  }, [activeThread])

  // Realtime subscription for new posts
  useEffect(() => {
    if (!activeThread) return

    const channel = supabase
      .channel(`group-posts-${activeThread}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_posts', filter: `thread_id=eq.${activeThread}` },
        () => {
          supabase.rpc('get_group_thread_posts', { p_thread_id: activeThread })
            .then(({ data }) => { if (data) setPosts(data as Post[]) })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeThread])

  function handleCreateThread(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setThreadErr(null)
    start(async () => {
      const result = await createThread(groupId, newTitle)
      if (result.error) { setThreadErr(result.error); return }
      setNewTitle('')
      setShowNewThread(false)
      // New thread appears via server revalidation on next navigation
    })
  }

  function handleDelete(postId: string) {
    start(async () => { await softDeletePost(groupId, postId) })
  }

  const activeThreadData = threads.find((t) => t.id === activeThread)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Discussions</h2>
        <button
          type="button"
          onClick={() => setShowNewThread((v) => !v)}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {showNewThread ? '✕ Cancel' : '+ New Thread'}
        </button>
      </div>

      {/* New thread form */}
      {showNewThread && (
        <form onSubmit={handleCreateThread} className="bg-white border border-border rounded-xl p-4 flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Thread title…"
            className="input flex-1"
            required
          />
          <button
            type="submit"
            disabled={pending || !newTitle.trim()}
            className="bg-primary text-primary-foreground font-bold px-3 py-2 rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? '…' : 'Start'}
          </button>
        </form>
      )}
      {threadErr && <p className="text-rose-600 text-sm">{threadErr}</p>}

      <div className="grid grid-cols-[240px_1fr] gap-4 min-h-[480px]">
        {/* Thread list sidebar */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm self-start">
          {threads.length === 0 ? (
            <p className="text-sm text-muted-foreground italic p-4">No threads yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setActiveThread(t.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                      activeThread === t.id ? 'bg-primary/5 border-l-2 border-primary' : ''
                    }`}
                  >
                    <div className="flex items-start gap-1.5">
                      {t.is_pinned && <span className="text-amber-500 text-xs shrink-0 mt-0.5">📌</span>}
                      {t.is_locked && <span className="text-slate-400 text-xs shrink-0 mt-0.5">🔒</span>}
                      <p className="text-sm font-medium text-foreground leading-snug">{t.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Post feed */}
        <div className="bg-white border border-border rounded-2xl shadow-sm flex flex-col">
          {!activeThread ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8">
              Select a thread to read
            </div>
          ) : (
            <>
              <div className="border-b border-border px-5 py-3">
                <p className="font-bold text-foreground">{activeThreadData?.title}</p>
                {activeThreadData?.is_locked && (
                  <p className="text-xs text-amber-600 mt-0.5">This thread is locked — no new replies.</p>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-80">
                {posts.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-8">No posts yet. Be the first!</p>
                ) : (
                  posts.map((p) => (
                    <div
                      key={p.post_id}
                      className={`flex gap-3 ${p.is_own ? 'flex-row-reverse' : ''}`}
                    >
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                        {p.display_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className={`max-w-[75%] ${p.is_own ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                        <p className={`text-xs text-muted-foreground ${p.is_own ? 'text-right' : ''}`}>
                          {p.is_own ? 'You' : p.display_name} · {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          p.is_own
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-slate-100 text-foreground rounded-tl-sm'
                        }`}>
                          {p.body}
                        </div>
                        {p.is_own && (
                          <button
                            type="button"
                            onClick={() => handleDelete(p.post_id)}
                            disabled={pending}
                            className="text-xs text-rose-400 hover:text-rose-600 mt-0.5 disabled:opacity-40"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {!activeThreadData?.is_locked && (
                <div className="border-t border-border p-4 space-y-1">
                  <DiscussionEditor
                    placeholder="Write a reply… (⌘↵ to send)"
                    onSubmit={(text) => {
                      if (!text || !activeThread) return
                      setPostErr(null)
                      start(async () => {
                        const result = await postToThread(groupId, activeThread, text)
                        if (result.error) setPostErr(result.error)
                      })
                    }}
                  />
                  {postErr && <p className="text-rose-600 text-xs">{postErr}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
