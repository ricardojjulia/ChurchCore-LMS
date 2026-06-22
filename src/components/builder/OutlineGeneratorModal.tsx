'use client'

import { useState, useRef } from 'react'
import { createCourseFromOutline } from '@/app/actions/learning'

interface OutlineBlock {
  title:     string
  type:      'text' | 'quiz' | 'discussion'
  objective: string
}

interface OutlineModule {
  title:  string
  blocks: OutlineBlock[]
}

interface OutlineSchema {
  course_title:       string
  course_description: string
  modules:            OutlineModule[]
}

const TYPE_ICON: Record<string, string> = { text: '📄', quiz: '🧠', discussion: '💬' }

interface Props {
  courseId:          string
  onOutlineAccepted: () => void
  onClose:           () => void
}

type Mode = 'input' | 'generating' | 'preview' | 'error'
type Tab  = 'text'  | 'file'

export default function OutlineGeneratorModal({ courseId, onOutlineAccepted, onClose }: Props) {
  const [mode,       setMode]       = useState<Mode>('input')
  const [tab,        setTab]        = useState<Tab>('text')
  const [inputText,  setInputText]  = useState('')
  const [inputFile,  setInputFile]  = useState<File | null>(null)
  const [outline,    setOutline]    = useState<OutlineSchema | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [accepting,  setAccepting]  = useState(false)
  const fileRef                     = useRef<HTMLInputElement>(null)

  async function generate() {
    setMode('generating')
    setError(null)

    let body: Record<string, string>

    if (tab === 'file' && inputFile) {
      if (inputFile.size > 5 * 1024 * 1024) {
        setError('File too large — maximum 5 MB.')
        setMode('error')
        return
      }
      const ab      = await inputFile.arrayBuffer()
      const bytes   = new Uint8Array(ab)
      // Convert to base64
      let binary    = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const b64     = btoa(binary)
      body          = { fileBase64: b64, fileType: inputFile.type || 'application/pdf' }
    } else {
      if (!inputText.trim()) {
        setError('Please enter some text content.')
        setMode('error')
        return
      }
      body = { text: inputText }
    }

    try {
      const res  = await fetch('/api/ai/outline-generator', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Outline generation failed. Please try again.')
        setMode('error')
        return
      }
      setOutline(data.outline as OutlineSchema)
      setMode('preview')
    } catch {
      setError('Network error — please check your connection and try again.')
      setMode('error')
    }
  }

  async function accept() {
    if (!outline) return
    setAccepting(true)
    const result = await createCourseFromOutline({ courseId, outline })
    setAccepting(false)
    if (result.error) {
      setError(result.error)
      setMode('error')
      return
    }
    onOutlineAccepted()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-extrabold text-foreground">✨ AI Course Outline</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paste your curriculum text or upload a PDF to generate an outline.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Input mode */}
          {(mode === 'input' || mode === 'error') && (
            <div className="space-y-4">
              {/* Tabs */}
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setTab('text')}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                    tab === 'text' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Paste Text
                </button>
                <button
                  type="button"
                  onClick={() => setTab('file')}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                    tab === 'file' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Upload File
                </button>
              </div>

              {tab === 'text' ? (
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste your sermon notes, Bible study guide, or curriculum text here…"
                  rows={10}
                  className="w-full border border-border rounded-xl px-4 py-3 text-sm text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              ) : (
                <div>
                  <div
                    className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    <p className="text-3xl mb-2">📄</p>
                    <p className="text-sm font-semibold text-foreground">
                      {inputFile ? inputFile.name : 'Click to select a file'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">PDF or TXT · max 5 MB</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    className="hidden"
                    title="Upload curriculum file"
                    onChange={(e) => setInputFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              )}

              {mode === 'error' && error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700 font-medium">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={generate}
                disabled={tab === 'text' ? !inputText.trim() : !inputFile}
                className="w-full py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-40 text-sm"
              >
                Generate Outline
              </button>
            </div>
          )}

          {/* Generating */}
          {mode === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground font-medium">Generating your course outline…</p>
              <p className="text-xs text-muted-foreground">This usually takes 5–15 seconds.</p>
            </div>
          )}

          {/* Preview */}
          {mode === 'preview' && outline && (
            <div className="space-y-4">
              <div>
                <h3 className="font-extrabold text-foreground text-lg">{outline.course_title}</h3>
                {outline.course_description && (
                  <p className="text-sm text-muted-foreground mt-1">{outline.course_description}</p>
                )}
              </div>

              <div className="space-y-3">
                {outline.modules.map((mod, mi) => (
                  <div key={mi} className="border border-border rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2.5 flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Module {mi + 1}
                      </span>
                      <span className="font-bold text-sm text-foreground">{mod.title}</span>
                    </div>
                    <div className="divide-y divide-border">
                      {mod.blocks.map((block, bi) => (
                        <div key={bi} className="px-4 py-2.5 flex items-start gap-3">
                          <span className="text-base shrink-0" aria-hidden="true">
                            {TYPE_ICON[block.type] ?? '📄'}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{block.title}</p>
                            {block.objective && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {block.objective}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                {outline.modules.length} modules · {outline.modules.reduce((n, m) => n + m.blocks.length, 0)} blocks
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === 'preview' && outline && (
          <div className="px-6 py-4 border-t border-border flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={accept}
              disabled={accepting}
              className="flex-1 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
            >
              {accepting ? 'Building course…' : 'Accept & Build'}
            </button>
            <button
              type="button"
              onClick={() => setMode('input')}
              className="px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
