'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useBeforeUnload } from '@/hooks/useBeforeUnload'
import RichTextEditor from './RichTextEditor'
import SaveIndicator from './SaveIndicator'
import { useContentAutoSave } from '@/hooks/useContentAutoSave'
import { updatePageContent, updatePageTitle, publishPage, unpublishPage, deletePage } from '@/app/actions/content'
import AiMaterialModal from '@/components/materials/AiMaterialModal'
import DocumentUploadButton from '@/components/materials/DocumentUploadButton'
import type { ParsedDocument } from '@/lib/document-parser'

interface Props {
  pageId:    string
  courseId:  string
  title:     string
  body:      object
  status:    'draft' | 'published' | 'archived'
}

export default function PageEditor({ pageId, courseId, title: initialTitle, body: initialBody, status: initialStatus }: Props) {
  const [title,          setTitle]          = useState(initialTitle)
  const [editorBody,     setEditorBody]     = useState(initialBody)
  const [editorKey,      setEditorKey]      = useState(0) // increment to reset editor on import/AI
  const [status,         setStatus]         = useState(initialStatus)
  const [titleErr,       setTitleErr]       = useState<string | null>(null)
  const [embeddingNote,  setEmbeddingNote]  = useState<string | null>(null)
  const [actionError,    setActionError]    = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [showAiModal,    setShowAiModal]    = useState(false)
  const [pubPending,     startPub]          = useTransition()
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
    setActionError(null)
    startPub(async () => {
      const res = await publishPage(pageId, courseId)
      if (res.error) {
        setActionError(`Failed to publish: ${res.error}`)
        return
      }
      setStatus('published')
      if (res.embeddingStatus === 'complete') {
        setEmbeddingNote('Indexed for AI search.')
      } else if (res.embeddingStatus === 'skipped') {
        setEmbeddingNote('AI index skipped (no content or API key not configured).')
      } else if (res.embeddingStatus === 'failed') {
        setEmbeddingNote('Published. AI indexing failed — will retry automatically.')
      }
      router.refresh()
    })
  }

  function handleUnpublish() {
    setActionError(null)
    startPub(async () => {
      const res = await unpublishPage(pageId, courseId)
      if (res.error) {
        setActionError(`Failed to unpublish: ${res.error}`)
      } else {
        setStatus('draft')
      }
    })
  }

  function handleArchive() {
    setActionError(null)
    startPub(async () => {
      try {
        await deletePage(pageId, courseId)
      } catch (err: any) {
        if (!err?.message?.includes('NEXT_REDIRECT')) {
          setActionError(`Failed to archive: ${err?.message || 'Server error'}`)
          setConfirmArchive(false)
        }
      }
    })
  }

  function handleAiGenerated(data: { title: string; text: string; tiptapContent: object }) {
    setShowAiModal(false)
    if (data.title && title === 'Untitled Page') {
      setTitle(data.title)
      updatePageTitle(pageId, data.title)
    }
    setEditorBody(data.tiptapContent)
    setEditorKey((k) => k + 1)
    scheduleSave(data.tiptapContent)
  }

  function handleDocumentImported(doc: ParsedDocument) {
    if (doc.title && title === 'Untitled Page') {
      setTitle(doc.title)
      updatePageTitle(pageId, doc.title)
    }
    setEditorBody(doc.tiptapContent)
    setEditorKey((k) => k + 1)
    scheduleSave(doc.tiptapContent)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Action Error Banner */}
      {actionError && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs px-4 py-3 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="font-bold text-rose-600 hover:text-rose-900 ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <button
          type="button"
          onClick={() => router.push(`/courses/${courseId}/pages`)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← All materials
        </button>

        <div className="flex items-center gap-2.5 flex-wrap">
          <SaveIndicator state={saveState} lastSaved={lastSaved} />

          {/* AI & File Import buttons */}
          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors shadow-sm"
            title="Generate content using AI prompt"
          >
            <span>✨</span>
            <span>AI Assistant</span>
          </button>

          <DocumentUploadButton
            courseId={courseId}
            onDocumentParsed={handleDocumentImported}
            buttonText="Import File"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors shadow-sm"
          />

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

          {/* Inline 2-step Archive Confirmation */}
          {confirmArchive ? (
            <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
              <span className="text-xs text-rose-800 font-medium">Archive?</span>
              <button
                type="button"
                disabled={pubPending}
                onClick={handleArchive}
                className="px-2 py-0.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded transition-colors disabled:opacity-50"
              >
                {pubPending ? '…' : 'Yes'}
              </button>
              <button
                type="button"
                disabled={pubPending}
                onClick={() => setConfirmArchive(false)}
                className="px-2 py-0.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              disabled={pubPending}
              className="text-sm font-semibold text-rose-600 hover:text-rose-800 transition-colors disabled:opacity-50"
            >
              Archive
            </button>
          )}
        </div>
      </div>

      {/* Draft callout */}
      {status === 'draft' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-4">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Draft — </span>students cannot see this material yet. Publish it when it's ready.
          </p>
          <button
            type="button"
            onClick={handlePublish}
            disabled={pubPending}
            className="shrink-0 text-sm font-bold text-white bg-primary rounded-lg px-4 py-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {pubPending ? 'Publishing…' : 'Publish now'}
          </button>
        </div>
      )}

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
        <input aria-label="Page title"
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
        key={editorKey}
        content={editorBody}
        onChange={scheduleSave}
        placeholder="Start writing your page content, use the AI Assistant, or import a document…"
        minHeight="480px"
      />

      <p className="text-xs text-muted-foreground mt-3 text-center">
        Content saves automatically as you type.
      </p>

      {/* AI Assistant Modal */}
      {showAiModal && (
        <AiMaterialModal
          initialPrompt={title && title !== 'Untitled Page' ? `Write comprehensive curriculum material for: ${title}` : ''}
          onGenerated={handleAiGenerated}
          onClose={() => setShowAiModal(false)}
        />
      )}
    </div>
  )
}
