'use client'

import { useState, useRef } from 'react'

interface Props {
  courseTitle?: string
  initialPrompt?: string
  onGenerated: (data: { title: string; text: string; tiptapContent: object }) => void
  onClose: () => void
}

const PROMPT_SUGGESTIONS = [
  'Biblical exposition with historical context and key scripture citations',
  'Pastoral counseling principles and practical ministry applications',
  'Theological doctrine overview with discussion questions and reflection prompts',
  'Step-by-step study guide with key takeaways and summary',
]

export default function AiMaterialModal({ courseTitle, initialPrompt = '', onGenerated, onClose }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ title: string; text: string; tiptapContent: object } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleGenerate() {
    if (!prompt.trim() && !file) {
      setError('Please enter a topic/prompt or attach a reference document.')
      return
    }

    setLoading(true)
    setError(null)

    let fileBase64: string | undefined
    let fileType: string | undefined

    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File exceeds maximum size of 5 MB.')
        setLoading(false)
        return
      }
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      fileBase64 = btoa(binary)
      fileType = file.type || 'text/plain'
    }

    try {
      const res = await fetch('/api/ai/material-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          courseTitle,
          fileBase64,
          fileType,
        }),
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Failed to generate material.')
        setLoading(false)
        return
      }

      setPreview(data)
      setLoading(false)
    } catch (err: any) {
      setError(err?.message || 'Network error occurred. Please try again.')
      setLoading(false)
    }
  }

  function handleAccept() {
    if (!preview) return
    onGenerated(preview)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <div>
              <h2 className="text-base font-bold text-foreground">AI Material Assistant</h2>
              <p className="text-xs text-muted-foreground">
                Generate formatted educational reading content, scriptures, and study guides.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1 rounded-lg hover:bg-slate-200 transition-colors"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-xl flex items-center justify-between">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 font-bold ml-2">
                ✕
              </button>
            </div>
          )}

          {!preview ? (
            <>
              <div>
                <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                  Topic, Passage, or Instructions
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Write a comprehensive lesson on Pastoral Care for grieving families, integrating 2 Corinthians 1:3-7, practical listening principles, and counseling reflection questions."
                  rows={4}
                  className="w-full text-sm border border-border rounded-xl p-3 bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/60 resize-y"
                />
              </div>

              {/* Suggestions */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Quick Starters:</p>
                <div className="flex flex-wrap gap-1.5">
                  {PROMPT_SUGGESTIONS.map((sug, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPrompt((prev) => (prev ? `${prev}\n${sug}` : sug))}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg transition-colors border border-slate-200"
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Reference Document */}
              <div className="pt-2 border-t border-border">
                <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                  Reference File / Notes (Optional)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setFile(e.target.files[0])
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold px-3 py-2 border border-border rounded-xl hover:bg-slate-50 text-foreground transition-colors flex items-center gap-2"
                  >
                    <span>📎</span>
                    <span>{file ? file.name : 'Attach PDF, DOCX, or TXT'}</span>
                  </button>
                  {file && (
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Generated Title</p>
                <p className="text-base font-extrabold text-foreground">{preview.title}</p>
              </div>

              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Content Preview</p>
                <div className="bg-slate-50 border border-border rounded-xl p-4 max-h-72 overflow-y-auto text-xs text-foreground leading-relaxed whitespace-pre-wrap font-sans">
                  {preview.text}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-border bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {preview ? (
              <>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="text-xs font-semibold text-slate-700 bg-white border border-border hover:bg-slate-100 px-3 py-2 rounded-xl transition-colors"
                >
                  ← Edit Prompt
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <span>✓</span>
                  <span>Insert into Material</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl transition-colors disabled:opacity-50 shadow-sm flex items-center gap-1.5"
              >
                <span>{loading ? '⏳' : '✨'}</span>
                <span>{loading ? 'Generating with AI…' : 'Generate Material'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
