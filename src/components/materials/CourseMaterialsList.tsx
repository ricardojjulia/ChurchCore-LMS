'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPageAndRedirect, createPageWithContent, archivePage } from '@/app/actions/content'
import AiMaterialModal from './AiMaterialModal'
import DocumentUploadButton from './DocumentUploadButton'

export interface MaterialPageItem {
  id: string
  title: string
  status: string
  updated_at: string
  published_at: string | null
  embedding_status?: string | null
}

interface Props {
  courseId: string
  courseTitle: string
  isStaff: boolean
  initialPages: MaterialPageItem[]
}

const STATUS_STYLE = {
  published: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  draft:     'text-amber-700 bg-amber-50 border-amber-200',
  archived:  'text-slate-500 bg-slate-50 border-slate-200',
}

const EMBED_BADGE: Record<string, { label: string; className: string }> = {
  complete:   { label: 'AI Ready',     className: 'text-violet-700 bg-violet-50 border-violet-200' },
  pending:    { label: 'Indexing',     className: 'text-slate-700 bg-slate-100 border-slate-200' },
  processing: { label: 'Indexing',     className: 'text-slate-700 bg-slate-100 border-slate-200' },
  stale:      { label: 'Stale',        className: 'text-slate-700 bg-slate-100 border-slate-200' },
  failed:     { label: 'Index failed', className: 'text-rose-600 bg-rose-50 border-rose-200' },
}

export default function CourseMaterialsList({
  courseId,
  courseTitle,
  isStaff,
  initialPages,
}: Props) {
  const [pages, setPages] = useState<MaterialPageItem[]>(initialPages)
  const [confirmingArchiveId, setConfirmingArchiveId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showAiModal, setShowAiModal] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  async function handleConfirmArchive(pageId: string) {
    setArchivingId(pageId)
    setActionError(null)

    const prevPages = [...pages]
    setPages((prev) => prev.filter((p) => p.id !== pageId))

    const res = await archivePage(pageId, courseId)
    setArchivingId(null)
    setConfirmingArchiveId(null)

    if (res?.error) {
      setPages(prevPages)
      setActionError(`Could not archive material: ${res.error}`)
    } else {
      router.refresh()
    }
  }

  async function handleAiMaterialGenerated(data: { title: string; text: string; tiptapContent: object }) {
    setShowAiModal(false)
    setActionError(null)
    startTransition(async () => {
      const res = await createPageWithContent(courseId, data.title, data.tiptapContent)
      if (res.error || !res.id) {
        setActionError(`Failed to create AI material: ${res.error || 'Server error'}`)
      } else {
        router.push(`/courses/${courseId}/pages/${res.id}/edit`)
      }
    })
  }

  return (
    <div>
      {/* Action Error Banner */}
      {actionError && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs px-4 py-3 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="font-bold text-rose-600 hover:text-rose-900 ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Staff Actions Bar */}
      {isStaff && (
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Published materials are visible to enrolled students.
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowAiModal(true)}
              className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold px-3.5 py-2 rounded-xl transition-colors shadow-sm"
              title="Generate new material with AI assistance"
            >
              <span>✨</span>
              <span>AI Material Generator</span>
            </button>

            <DocumentUploadButton
              courseId={courseId}
              buttonText="Import Document"
              className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold px-3.5 py-2 rounded-xl transition-colors shadow-sm"
            />

            <form action={createPageAndRedirect.bind(null, courseId)}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
              >
                <span>+</span>
                <span>New Material</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* List / Empty State */}
      {pages.length === 0 ? (
        <div className="bg-white border border-border rounded-2xl p-12 text-center shadow-sm">
          <p className="text-4xl mb-3">📚</p>
          <h2 className="text-base font-bold text-foreground mb-1">
            No course materials yet
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Add readings, study guides, and resources for your students using the editor, AI prompt, or by importing documents.
          </p>

          {isStaff && (
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setShowAiModal(true)}
                className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-indigo-500 transition-colors shadow-sm"
              >
                <span>✨</span>
                <span>Create with AI</span>
              </button>
              <DocumentUploadButton
                courseId={courseId}
                buttonText="Upload PDF or DOCX"
                className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {pages.map((p) => {
            const style = STATUS_STYLE[p.status as keyof typeof STATUS_STYLE] ?? STATUS_STYLE.draft
            const embedBadge = p.status === 'published'
              ? (EMBED_BADGE[p.embedding_status ?? 'pending'] ?? EMBED_BADGE.pending)
              : null
            const isConfirming = confirmingArchiveId === p.id
            const isArchiving = archivingId === p.id

            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 bg-white border border-border rounded-xl px-5 py-4 hover:shadow-sm hover:border-primary/30 transition-all group"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <span className="text-xl shrink-0" aria-hidden="true">📄</span>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={isStaff ? `/courses/${courseId}/pages/${p.id}/edit` : `/courses/${courseId}/pages/${p.id}`}
                      className="text-sm font-semibold text-foreground truncate block hover:text-primary transition-colors"
                    >
                      {p.title}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.status === 'published' && p.published_at
                        ? `Published ${new Date(p.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : `Updated ${new Date(p.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                      }
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {isStaff && embedBadge && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${embedBadge.className}`}>
                      {embedBadge.label}
                    </span>
                  )}
                  {isStaff && (
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border capitalize ${style}`}>
                      {p.status}
                    </span>
                  )}

                  {isStaff ? (
                    <div className="flex items-center gap-2 ml-2">
                      <Link
                        href={`/courses/${courseId}/pages/${p.id}/edit`}
                        className="text-xs font-semibold text-slate-700 hover:text-primary bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 transition-colors"
                      >
                        Edit
                      </Link>

                      <Link
                        href={`/courses/${courseId}/pages/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 transition-colors"
                        title="Preview student view (new tab)"
                      >
                        👁️
                      </Link>

                      {isConfirming ? (
                        <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                          <button
                            type="button"
                            disabled={isArchiving}
                            onClick={() => handleConfirmArchive(p.id)}
                            className="px-2 py-0.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded transition-colors disabled:opacity-50"
                          >
                            {isArchiving ? '…' : 'Archive'}
                          </button>
                          <button
                            type="button"
                            disabled={isArchiving}
                            onClick={() => setConfirmingArchiveId(null)}
                            className="px-1.5 py-0.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingArchiveId(p.id)}
                          className="text-xs text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                          title="Archive this material"
                          aria-label={`Archive ${p.title}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ) : (
                    <Link
                      href={`/courses/${courseId}/pages/${p.id}`}
                      className="text-muted-foreground text-sm hover:text-primary transition-colors"
                    >
                      →
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* AI Material Generator Modal */}
      {showAiModal && (
        <AiMaterialModal
          courseTitle={courseTitle}
          onGenerated={handleAiMaterialGenerated}
          onClose={() => setShowAiModal(false)}
        />
      )}
    </div>
  )
}
