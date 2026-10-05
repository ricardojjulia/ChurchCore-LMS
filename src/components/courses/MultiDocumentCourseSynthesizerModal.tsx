'use client'

import { useState, useRef } from 'react'
import { FileText, Upload, Sparkles, X, CheckCircle, AlertCircle, Loader2, BookOpen, Layers } from 'lucide-react'
import type { MultiDocumentSynthesizedCourse } from '@/lib/theology/multi-document-synthesizer'

interface MultiDocumentCourseSynthesizerModalProps {
  isOpen: boolean
  onClose: () => void
  onCourseGenerated?: (course: MultiDocumentSynthesizedCourse) => void
}

interface UploadedFileItem {
  file: File
  name: string
  sizeFormatted: string
  extension: string
}

export function MultiDocumentCourseSynthesizerModal({
  isOpen,
  onClose,
  onCourseGenerated,
}: MultiDocumentCourseSynthesizerModalProps) {
  const [files, setFiles] = useState<UploadedFileItem[]>([])
  const [courseTitleHint, setCourseTitleHint] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [theologicalTradition, setTheologicalTradition] = useState('Evangelical / Ecumenical')
  const [pacingWeeks, setPacingWeeks] = useState(4)

  const [isLoading, setIsLoading] = useState(false)
  const [progressStep, setProgressStep] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [generatedCourse, setGeneratedCourse] = useState<MultiDocumentSynthesizedCourse | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const incoming = Array.from(e.target.files)

    const mapped: UploadedFileItem[] = incoming.map((f) => ({
      file: f,
      name: f.name,
      sizeFormatted: formatFileSize(f.size),
      extension: f.name.split('.').pop()?.toLowerCase() || '',
    }))

    setFiles((prev) => [...prev, ...mapped].slice(0, 10))
    setError(null)
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const res = reader.result as string
        const base64 = res.split(',')[1] || res
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleSynthesize = async () => {
    if (files.length === 0) {
      setError('Please add at least one Word document, PowerPoint presentation, or notes file.')
      return
    }

    setIsLoading(true)
    setError(null)
    setProgressStep(`Reading and decompressing ${files.length} document(s)...`)

    try {
      const payloadFiles = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          base64: await readFileAsBase64(f.file),
        }))
      )

      setProgressStep('Synthesizing curriculum hierarchy, theological grounding, & quizzes...')

      const res = await fetch('/api/ai/documents-to-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: payloadFiles,
          courseTitleHint: courseTitleHint.trim() || undefined,
          targetAudience: targetAudience.trim() || undefined,
          theologicalTradition: theologicalTradition.trim() || undefined,
          pacingWeeks,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to synthesize course from documents.')
      }

      setGeneratedCourse(data.course)
      if (onCourseGenerated) {
        onCourseGenerated(data.course)
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during course synthesis.')
    } finally {
      setIsLoading(false)
      setProgressStep('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                Multi-Document Course Synthesizer
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Synthesize Word notes (.docx), PowerPoint decks (.pptx), PDFs, and text into a complete course.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!generatedCourse ? (
          <div className="mt-6 space-y-6">
            {/* File Dropzone */}
            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Upload Source Files (.docx, .pptx, .pdf, .txt, .md)
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-xl p-6 text-center bg-zinc-50 dark:bg-zinc-800/50 transition"
              >
                <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Click to select multiple files or drag them here
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Upload up to 10 files (PowerPoint slides, sermon notes, syllabi, study guides)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".docx,.pptx,.pdf,.txt,.md"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Uploaded files list */}
              {files.length > 0 && (
                <div className="mt-3 space-y-2 max-h-40 overflow-y-auto pr-1">
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-sm border border-zinc-200 dark:border-zinc-700"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                        <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{file.name}</span>
                        <span className="text-xs text-zinc-400 flex-shrink-0">({file.sizeFormatted})</span>
                      </div>
                      <button
                        onClick={() => removeFile(idx)}
                        className="text-zinc-400 hover:text-red-500 p-1 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Optional Customization Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                  Course Title Hint (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Biblical Leadership in the Marketplace"
                  value={courseTitleHint}
                  onChange={(e) => setCourseTitleHint(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                  Target Audience
                </label>
                <input
                  type="text"
                  placeholder="e.g. Deacons, Ministry Directors, New Believers"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                  Theological Tradition
                </label>
                <select
                  value={theologicalTradition}
                  onChange={(e) => setTheologicalTradition(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="Evangelical / Ecumenical">Evangelical / Ecumenical</option>
                  <option value="Reformed / Covenant">Reformed / Covenant</option>
                  <option value="Wesleyan / Arminian">Wesleyan / Arminian</option>
                  <option value="Eastern Orthodox">Eastern Orthodox</option>
                  <option value="Catholic / Classical">Catholic / Classical</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                  Target Modules / Weeks ({pacingWeeks} modules)
                </label>
                <input
                  type="range"
                  min="2"
                  max="8"
                  value={pacingWeeks}
                  onChange={(e) => setPacingWeeks(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-600 mt-2"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 text-sm border border-red-200 dark:border-red-900">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSynthesize}
                disabled={isLoading || files.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md transition disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Synthesize Course ({files.length} Files)</span>
                  </>
                )}
              </button>
            </div>

            {isLoading && (
              <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 text-center animate-pulse">
                <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">{progressStep}</p>
              </div>
            )}
          </div>
        ) : (
          /* Generated Course Preview */
          <div className="mt-6 space-y-6">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-emerald-900 dark:text-emerald-200 text-base">
                  {generatedCourse.course_title}
                </h3>
                <p className="text-sm text-emerald-800 dark:text-emerald-300 mt-1">
                  {generatedCourse.course_description}
                </p>
                <div className="flex flex-wrap gap-2 mt-3 text-xs">
                  <span className="px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-medium">
                    {generatedCourse.theological_framework}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-medium">
                    {generatedCourse.modules.length} Modules
                  </span>
                </div>
              </div>
            </div>

            {/* Modules Outline */}
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {generatedCourse.modules.map((m) => (
                <div
                  key={m.module_number}
                  className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60"
                >
                  <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    <span>Module {m.module_number}: {m.title}</span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{m.description}</p>
                  <div className="mt-2.5 pl-4 border-l-2 border-indigo-200 dark:border-indigo-800 space-y-1.5">
                    {m.lessons.map((l) => (
                      <div key={l.lesson_number} className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300">
                        <div className="flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{l.title} ({l.estimated_minutes} min)</span>
                        </div>
                        <span className="text-[11px] text-zinc-400">{l.blocks.length} blocks</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setGeneratedCourse(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                Upload Different Files
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md transition"
              >
                Done & Open in Course Editor
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
