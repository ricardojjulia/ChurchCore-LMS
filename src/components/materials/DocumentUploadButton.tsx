'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseDocumentFile, type ParsedDocument } from '@/lib/document-parser'
import { createPageWithContent } from '@/app/actions/content'

interface Props {
  courseId: string
  onDocumentParsed?: (parsed: ParsedDocument) => void
  buttonText?: string
  className?: string
}

export default function DocumentUploadButton({
  courseId,
  onDocumentParsed,
  buttonText = 'Import Document',
  className,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const buffer = await file.arrayBuffer()
      const parsed = await parseDocumentFile(file.name, buffer)

      if (onDocumentParsed) {
        onDocumentParsed(parsed)
        setUploading(false)
      } else {
        // Create new page in course and redirect
        const res = await createPageWithContent(courseId, parsed.title, parsed.tiptapContent)
        if (res.error || !res.id) {
          setError(res.error || 'Failed to create material page.')
          setUploading(false)
          return
        }
        router.push(`/courses/${courseId}/pages/${res.id}/edit`)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to read document.')
      setUploading(false)
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="relative inline-flex items-center">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt,.md"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={
          className ||
          'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-border rounded-xl hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50'
        }
        title="Import text, PDF, or Word document"
      >
        <span>📄</span>
        <span>{uploading ? 'Importing…' : buttonText}</span>
      </button>

      {error && (
        <div className="absolute top-full left-0 mt-2 z-30 bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap flex items-center gap-2">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-bold text-rose-600">✕</button>
        </div>
      )}
    </div>
  )
}
