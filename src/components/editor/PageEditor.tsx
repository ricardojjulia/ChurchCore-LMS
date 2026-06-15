'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useBeforeUnload } from '@/hooks/useBeforeUnload'
import RichTextEditor from './RichTextEditor'
import SaveIndicator from './SaveIndicator'
import { useContentAutoSave } from '@/hooks/useContentAutoSave'
import { updatePageContent, updatePageTitle, publishPage, unpublishPage, deletePage } from '@/app/actions/content'

interface Props {
  pageId:    string
  courseId:  string
  title:     string
  body:      object
  status:    'draft' | 'published' | 'archived'
}

export default function PageEditor({ pageId, courseId, title: initialTitle, body, status: initialStatus }: Props) {
  const [title,          setTitle]         = useState(initialTitle)
  const [status,         setStatus]        = useState(initialStatus)
  const [titleErr,       setTitleErr]      = useState<string | null>(null)
  const [embeddingNote,  setEmbeddingNote] = useState<string | null>(null)
  const [pubPending,     startPub]         = useTransition()
  const router = useRouter()

  const saveContent = useCallback(
    (content: object) => updatePageContent(pageId, content),
    [pageId]
  )

  const { scheduleSave, saveState, lastSaved } = useContentAutoSave(saveContent)

  // Warn before tab/window close when there are pending saves
  useBeforeUnload(saveState === 'saving' || saveState === 'error')

  async function handleTitleBlur() {
    if (!title.trim()) { setTitleErr('Title is required.'); return }
    setTitleErr(null)
    await updatePageTitle(pageId, title)
  }

  function handlePublish() {
    setEmbeddingNote(null)
    startPub(async () => {
      const res = await publishPage(pageId, courseId)
      if (!res.error) {
        setStatus('published')
        if (res.embeddingStatus === 'complete') {
          setEmbeddingNote('Indexed for AI search.')
        } else if (res.embeddingStatus === 'skipped') {
          setEmbeddingNote('AI index skipped (no content or API key not configured).')
        } else if (res.embeddingStatus === 'failed') {
          setEmbeddingNote('Published. AI indexing failed — will retry automatically.')
        }
        router.refresh()
      }
    })
  }

  function handleUnpublish() {
    startPub(async () => {
      const res = await unpublishPage(pageId, courseId)
      if (!res.error) setStatus('draft')
    })
  }

  function handleDelete() {
    if (!confirm('Archive this page? It will no longer be visible to students.')) return
    startPub(() => deletePage(pageId, courseId))
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <button
          type="button"
          onClick={() => router.push(`/courses/${courseId}/pages`)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← All pages
        </button>

        <div className="flex items-center gap-3">
          <SaveIndicator state={saveState} lastSaved={lastSaved} />

          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
            status === 'published'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {status === 'published' ? 'Published' : 'Draft'}
          </span>

          {status === 'published' ? (
            <button
              type="button"
              onClick={handleUnpublish}
              disabled={pubPending}
              className="text-sm font-semibold text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Unpublish
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePublish}
              disabled={pubPending}
              className="text-sm font-semibold text-white bg-primary border border-primary rounded-lg px-4 py-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {pubPending ? 'Publishing…' : 'Publish'}
            </button>
          )}

          <button
            type="button"
            onClick={handleDelete}
            disabled={pubPending}
            className="text-sm font-semibold text-rose-600 hover:text-rose-800 transition-colors disabled:opacity-50"
          >
            Archive
          </button>
        </div>
      </div>

      {/* Embedding status note */}
      {embeddingNote && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-2 mb-4 text-xs text-violet-700 flex items-center gap-2">
          <span aria-hidden="true">✦</span>
          {embeddingNote}
        </div>
      )}

      {/* Mobile warning */}
      <div className="sm:hidden bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800">
        For the best editing experience, use a desktop or tablet.
      </div>

      {/* Title */}
      <div className="mb-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="Page title…"
          className="w-full text-3xl font-extrabold text-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/40 focus:ring-0"
        />
        {titleErr && <p className="text-xs text-rose-600 mt-1">{titleErr}</p>}
        <div className="h-px bg-border mt-3" />
      </div>

      {/* Editor */}
      <RichTextEditor
        content={body}
        onChange={scheduleSave}
        placeholder="Start writing your page content…"
        minHeight="480px"
      />

      <p className="text-xs text-muted-foreground mt-3 text-center">
        Content saves automatically as you type.
      </p>
    </div>
  )
}
