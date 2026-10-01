'use client'

import { useState, useRef } from 'react'
import { createCourseFromOutline, type OutlineSchema } from '@/app/actions/learning'

const TYPE_ICON: Record<string, string> = {
  text:       '📄',
  page:       '📄',
  quiz:       '🧠',
  discussion: '💬',
  assignment: '📝',
}

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
  const [buildMode,  setBuildMode]  = useState<'append' | 'replace'>('append')
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
      
      let data: any = null
      try {
        data = await res.json()
      } catch {
        // Non-JSON response (e.g. gateway timeout or proxy error)
      }

      if (!res.ok || data?.error) {
        setError(data?.error ?? `Generation request failed (${res.status}: ${res.statusText || 'Server Error'})`)
        setMode('error')
        return
      }

      setOutline(data.outline as OutlineSchema)
      setMode('preview')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setError(`${msg} — please check your connection or server logs and try again.`)
      setMode('error')
    }
  }

  async function accept() {
    if (!outline) return
    setAccepting(true)
    setError(null)
    const result = await createCourseFromOutline({ courseId, outline, mode: buildMode })
    setAccepting(false)
    if (result.error) {
      setError(result.error)
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
                <textarea aria-label="Source text for the outline"
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
                          <span className="text-base shrink-0 mt-0.5" aria-hidden="true">
                            {TYPE_ICON[block.type] ?? '📄'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground">{block.title}</p>
                              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-muted-foreground shrink-0">
                                {block.type}
                              </span>
                            </div>
                            {block.objective && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {block.objective}
                              </p>
                            )}
                            {Boolean(block.content?.body) && (
                              <div className="mt-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-md p-2 line-clamp-2 italic">
                                {typeof block.content?.body === 'string'
                                  ? block.content.body.replace(/<[^>]*>/g, ' ').trim().slice(0, 140) + '…'
                                  : 'Rich text lesson content ready'}
                              </div>
                            )}
                            {Boolean(block.content?.prompt) && (
                              <p className="mt-1.5 text-xs text-rose-700 bg-rose-50/80 border border-rose-100 rounded-md p-1.5 line-clamp-2">
                                💬 <strong>Prompt:</strong> {String(block.content?.prompt)}
                              </p>
                            )}
                            {Boolean(block.content?.instructions) && (
                              <p className="mt-1.5 text-xs text-emerald-800 bg-emerald-50/80 border border-emerald-100 rounded-md p-1.5 line-clamp-2">
                                📝 <strong>Instructions:</strong> {String(block.content?.instructions)}
                              </p>
                            )}
                            {Array.isArray(block.content?.questions) && block.content.questions.length > 0 && (
                              <p className="mt-1.5 text-xs text-violet-700 bg-violet-50/80 border border-violet-100 rounded-md px-2 py-1 inline-flex items-center gap-1.5 font-medium">
                                🧠 {block.content.questions.length} quiz questions generated
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Mode Selection */}
              <div className="bg-slate-50 border border-border rounded-xl p-3.5 space-y-2 mt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Course Build Action</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      buildMode === 'append'
                        ? 'bg-white border-primary ring-2 ring-primary/20 text-foreground shadow-sm'
                        : 'bg-white/60 border-border text-muted-foreground hover:bg-white hover:text-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name="buildMode"
                      value="append"
                      checked={buildMode === 'append'}
                      onChange={() => setBuildMode('append')}
                      className="mt-0.5 text-primary focus:ring-primary h-4 w-4"
                    />
                    <div>
                      <p className="text-xs font-bold text-foreground">
                        ➕ Add to Course (Append)
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        Preserves all existing lessons and appends these {outline.modules.length} modules to the end.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      buildMode === 'replace'
                        ? 'bg-rose-50/70 border-rose-400 ring-2 ring-rose-400/20 text-rose-950 shadow-sm'
                        : 'bg-white/60 border-border text-muted-foreground hover:bg-white hover:text-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name="buildMode"
                      value="replace"
                      checked={buildMode === 'replace'}
                      onChange={() => setBuildMode('replace')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500 h-4 w-4"
                    />
                    <div>
                      <p className="text-xs font-bold text-rose-900">
                        🔄 Replace Entire Course
                      </p>
                      <p className="text-[11px] text-rose-700/80 mt-0.5 leading-snug">
                        Clears existing modules in this course and replaces them with this new outline.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center pt-1">
                {outline.modules.length} modules · {outline.modules.reduce((n, m) => n + m.blocks.length, 0)} blocks
              </p>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700 font-medium">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === 'preview' && outline && (
          <div className="px-6 py-4 border-t border-border flex items-center gap-3 shrink-0 bg-slate-50/50">
            <button
              type="button"
              onClick={accept}
              disabled={accepting}
              className={`flex-1 py-2.5 font-bold rounded-xl transition-colors disabled:opacity-50 text-sm shadow-sm ${
                buildMode === 'replace'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-primary hover:bg-primary/90 text-primary-foreground'
              }`}
            >
              {accepting
                ? 'Building course…'
                : buildMode === 'replace'
                ? 'Replace All & Build Course'
                : `Add ${outline.modules.length} Module${outline.modules.length > 1 ? 's' : ''} to Course`}
            </button>
            <button
              type="button"
              onClick={() => setMode('input')}
              className="px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors border border-border bg-white rounded-xl hover:bg-slate-50"
            >
              Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

