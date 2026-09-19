'use client'

import { useState, useTransition, useEffect, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
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
  initialThreads: Thread[]
}

export default function GroupDiscussionBoard({
  groupId, initialThreads,
}: Props) {
  const t = useTranslations()
  const threads = initialThreads
  const [selectedThread, setActiveThread] = useState<string | null>(null)
  const activeThread = selectedThread ?? threads[0]?.id ?? null
  const [posts,         setPosts]        = useState<Post[]>([])
  const [newTitle,      setNewTitle]     = useState('')
  const [showNewThread, setShowNewThread] = useState(false)
  const [threadErr,     setThreadErr]    = useState<string | null>(null)
  const [postErr,       setPostErr]      = useState<string | null>(null)
  const [pending,       start]           = useTransition()

  const supabase = useMemo(() => createClient(), [])

  const loadPosts = useCallback(async () => {
    if (!activeThread) return
    const { data, error } = await supabase.rpc('get_group_thread_posts', { p_thread_id: activeThread })
    if (error) setPostErr('Unable to load replies. Please try again.')
    else setPosts((data ?? []) as Post[])
  }, [activeThread, supabase])

  useEffect(() => {
    let current = true
    setPosts([])
    setPostErr(null)
    if (!activeThread) return
    const refresh = async () => {
      const { data, error } = await supabase.rpc('get_group_thread_posts', { p_thread_id: activeThread })
      if (!current) return
      if (error) setPostErr('Unable to load replies. Please try again.')
      else setPosts((data ?? []) as Post[])
    }
    void refresh()
    const channel = supabase.channel(`group-posts-${activeThread}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'group_posts', filter: `thread_id=eq.${activeThread}` },
        () => { void refresh() })
      .subscribe()
    return () => { current = false; void supabase.removeChannel(channel) }
  }, [activeThread, supabase])

  function handleCreateThread(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setThreadErr(null)
    start(async () => {
      const result = await createThread(groupId, newTitle)
      if (result.error) { setThreadErr(result.error); return }
      setNewTitle('')
      setShowNewThread(false)
      if (result.threadId) setActiveThread(result.threadId)
    })
  }

  function handleDelete(postId: string) {
    setPostErr(null)
    start(async () => {
      const result = await softDeletePost(groupId, postId)
      if (result.error) setPostErr(result.error)
      else await loadPosts()
    })
  }

  const activeThreadData = threads.find((t) => t.id === activeThread)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">{t('myGroups.discussion.heading')}</h2>
        <button
          type="button"
          onClick={() => setShowNewThread((v) => !v)}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {showNewThread ? t('myGroups.discussion.cancelToggleButton') : t('myGroups.discussion.newThreadButton')}
        </button>
      </div>

      {/* New thread form */}
      {showNewThread && (
        <form onSubmit={handleCreateThread} className="bg-white border border-border rounded-xl p-4 flex gap-2">
          <input
            aria-label="Thread title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t('myGroups.discussion.threadTitlePlaceholder')}
            className="input flex-1 min-w-0"
            required
          />
          <button
            type="submit"
            disabled={pending || !newTitle.trim()}
            className="bg-primary text-primary-foreground font-bold px-3 py-2 rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? '…' : t('myGroups.discussion.startButton')}
          </button>
        </form>
      )}
      {threadErr && <p className="text-rose-600 text-sm">{threadErr}</p>}

      <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] gap-4 min-h-[480px]">
        {/* Thread list sidebar */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm self-start">
          {threads.length === 0 ? (
            <p className="text-sm text-muted-foreground italic p-4">{t('myGroups.discussion.emptyThreads')}</p>
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
        <div className="bg-white border border-border rounded-2xl shadow-sm min-w-0 flex flex-col">
          {!activeThread ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8">
              {t('myGroups.discussion.selectThreadPlaceholder')}
            </div>
          ) : (
            <>
              <div className="border-b border-border px-5 py-3">
                <p className="font-bold text-foreground">{activeThreadData?.title}</p>
                {activeThreadData?.is_locked && (
                  <p className="text-xs text-amber-600 mt-0.5">{t('myGroups.discussion.lockedThreadNotice')}</p>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-80">
                {posts.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-8">{t('myGroups.discussion.emptyPosts')}</p>
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
                          {p.is_own ? t('myGroups.discussion.ownPostAuthorLabel') : p.display_name} · {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
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
                            {t('common.delete')}
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
                    key={activeThread}
                    placeholder={t('myGroups.discussion.replyPlaceholder')}
                    onSubmit={(text) => {
                      if (!text || !activeThread) return
                      setPostErr(null)
                      start(async () => {
                        const result = await postToThread(groupId, activeThread, text)
                        if (result.error) setPostErr(result.error)
                        else await loadPosts()
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
