'use client'

import { useState, useTransition, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { submitAssignment } from '@/app/actions/learning'

const ACCEPTED = '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

interface Props {
  blockId:       string
  instructions:  string
  maxPoints:     number
  onComplete?:   (xpAwarded: number) => void
  existingSub?: {
    status:    string
    content:   { text?: string; file_url?: string; file_name?: string }
    score:     number | null
    max_score: number | null
    grade_pct: number | null
    feedback:  string | null
  } | null
}

export default function AssignmentPlayer({ blockId, instructions, maxPoints, existingSub, onComplete }: Props) {
  const [body,    setBody]    = useState(existingSub?.content?.text ?? '')
  const [file,    setFile]    = useState<File | null>(null)
  const [fileErr, setFileErr] = useState<string | null>(null)
  const [result,  setResult]  = useState<{ error?: string; done?: boolean } | null>(null)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const alreadySubmitted = existingSub?.status === 'submitted'
  const isGraded         = existingSub?.status === 'graded'

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFileErr(null)
    if (!f) { setFile(null); return }
    if (f.size > MAX_BYTES) {
      setFileErr('File exceeds 10 MB limit')
      e.target.value = ''
      return
    }
    setFile(f)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() && !file) return
    startTransition(async () => {
      let fileUrl: string | undefined
      let fileName: string | undefined

      if (file) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setResult({ error: 'Not authenticated' }); return }

        const ext  = file.name.split('.').pop() ?? 'bin'
        const path = `${user.id}/${blockId}/${Date.now()}.${ext}`

        const { data: uploaded, error: uploadErr } = await supabase.storage
          .from('assignment-files')
          .upload(path, file, { upsert: true })

        if (uploadErr) { setResult({ error: `Upload failed: ${uploadErr.message}` }); return }

        const { data: { publicUrl } } = supabase.storage
          .from('assignment-files')
          .getPublicUrl(uploaded.path)

        // Use a signed URL (private bucket) instead of publicUrl
        const { data: signed } = await supabase.storage
          .from('assignment-files')
          .createSignedUrl(uploaded.path, 60 * 60 * 24 * 30) // 30-day link

        fileUrl  = signed?.signedUrl ?? publicUrl
        fileName = file.name
      }

      const res = await submitAssignment(blockId, body, maxPoints, fileUrl, fileName)
      if (res.error) {
        setResult({ error: res.error })
      } else {
        setResult({ done: true })
        onComplete?.(res.xpAwarded ?? 0)
      }
    })
  }

  if (result?.done || alreadySubmitted) {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 space-y-3">
        <p className="text-sm font-semibold text-emerald-700">
          ✓ Submitted — awaiting instructor grade
        </p>
        {existingSub?.content?.text && (
          <div className="text-sm text-slate-700 whitespace-pre-wrap bg-white border border-border rounded-lg p-4">
            {existingSub.content.text}
          </div>
        )}
        {existingSub?.content?.file_url && (
          <a
            href={existingSub.content.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
          >
            📎 {existingSub.content.file_name ?? 'Attached file'}
          </a>
        )}
      </div>
    )
  }

  if (isGraded && existingSub) {
    const pct   = existingSub.grade_pct
    const color = pct === null ? 'slate' : pct >= 90 ? 'emerald' : pct >= 70 ? 'amber' : 'rose'
    return (
      <div className={`mt-6 rounded-xl border border-${color}-200 bg-${color}-50 px-5 py-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <p className={`text-sm font-bold text-${color}-700`}>
            Grade: {existingSub.score ?? '?'} / {existingSub.max_score ?? maxPoints}
            {pct !== null && ` (${pct}%)`}
          </p>
        </div>
        {existingSub.feedback && (
          <p className="text-sm text-slate-700 italic">{existingSub.feedback}</p>
        )}
        {existingSub.content?.text && (
          <div className="text-sm text-slate-600 whitespace-pre-wrap bg-white border border-border rounded-lg p-4">
            {existingSub.content.text}
          </div>
        )}
        {existingSub.content?.file_url && (
          <a
            href={existingSub.content.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
          >
            📎 {existingSub.content.file_name ?? 'Attached file'}
          </a>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="rounded-xl border border-border bg-white p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Your Response
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Write your response here…"
            className="w-full text-sm text-foreground bg-slate-50 border border-border rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition"
            aria-label="Assignment response"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {body.length.toLocaleString()} characters · Max points: {maxPoints}
          </p>
        </div>

        {/* File attachment */}
        <div>
          <p className="text-sm font-semibold text-foreground mb-2">Attachment <span className="font-normal text-muted-foreground">(optional)</span></p>
          {file ? (
            <div className="flex items-center gap-3 bg-slate-50 border border-border rounded-lg px-4 py-2.5">
              <span className="text-lg" aria-hidden="true">📎</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                aria-label="Remove file"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-3 bg-slate-50 border border-dashed border-border rounded-lg px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors">
              <span className="text-slate-400 text-xl" aria-hidden="true">📤</span>
              <div>
                <p className="text-sm font-medium text-foreground">Upload a file</p>
                <p className="text-xs text-muted-foreground">PDF, Word, image — max 10 MB</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED}
                onChange={onFileChange}
                className="sr-only"
                aria-label="Upload assignment file"
              />
            </label>
          )}
          {fileErr && <p className="text-xs text-rose-600 mt-1" role="alert">{fileErr}</p>}
        </div>
      </div>

      {result?.error && (
        <p className="text-sm text-rose-600 font-medium" role="alert">{result.error}</p>
      )}

      <button
        type="submit"
        disabled={pending || (!body.trim() && !file)}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {pending ? 'Submitting…' : 'Submit Assignment'}
      </button>
    </form>
  )
}
