'use client'

import { useState, useTransition, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/utils/supabase/client'
import { submitAssignment } from '@/app/actions/learning'

const ACCEPTED = '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

interface Props {
  blockId:        string
  instructions:   string
  maxPoints:      number
  submissionType?: 'text' | 'file' | 'both'
  onComplete?:    (xpAwarded: number) => void
  existingSub?: {
    status:    string
    content:   { text?: string; file_url?: string; file_name?: string }
    score:     number | null
    max_score: number | null
    grade_pct: number | null
    feedback:  string | null
  } | null
}

export default function AssignmentPlayer({ blockId, instructions, maxPoints, submissionType = 'both', existingSub, onComplete }: Props) {
  const t = useTranslations()
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
      setFileErr(t('learning.assignment.fileTooLargeError'))
      e.target.value = ''
      return
    }
    setFile(f)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submissionType === 'text' && !body.trim()) return
    if (submissionType === 'file' && !file) return
    if (submissionType === 'both' && !body.trim() && !file) return
    startTransition(async () => {
      let fileUrl: string | undefined
      let fileName: string | undefined

      if (file) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setResult({ error: t('learning.assignment.notAuthenticatedError') }); return }

        const ext  = file.name.split('.').pop() ?? 'bin'
        const path = `${user.id}/${blockId}/${Date.now()}.${ext}`

        const { data: uploaded, error: uploadErr } = await supabase.storage
          .from('assignment-files')
          .upload(path, file, { upsert: true })

        if (uploadErr) { setResult({ error: `${t('learning.assignment.uploadFailedPrefix')} ${uploadErr.message}` }); return }

        // assignment-files is a private bucket — signed URLs only
        const { data: signed, error: signErr } = await supabase.storage
          .from('assignment-files')
          .createSignedUrl(uploaded.path, 60 * 60 * 24 * 30) // 30-day link

        if (signErr || !signed?.signedUrl) {
          setResult({ error: t('learning.assignment.signedUrlError') })
          return
        }

        fileUrl  = signed.signedUrl
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
      <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 space-y-3">
        <p className="text-sm font-semibold text-emerald-400">
          {t('learning.assignment.submittedBanner')}
        </p>
        {existingSub?.content?.text && (
          <div className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-900 border border-slate-800 rounded-lg p-4">
            {existingSub.content.text}
          </div>
        )}
        {existingSub?.content?.file_url && (
          <a
            href={existingSub.content.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 hover:underline font-medium"
          >
            📎 {existingSub.content.file_name ?? t('learning.assignment.attachedFileFallback')}
          </a>
        )}
      </div>
    )
  }

  if (isGraded && existingSub) {
    const pct   = existingSub.grade_pct
    const colorClasses = pct === null
      ? 'border-slate-800 bg-slate-900 text-slate-300'
      : pct >= 90
      ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
      : pct >= 70
      ? 'border-amber-500/30 bg-amber-950/40 text-amber-300'
      : 'border-rose-500/30 bg-rose-950/40 text-rose-300'

    return (
      <div className={`mt-6 rounded-xl border ${colorClasses} px-5 py-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">
            {t('learning.assignment.gradeLabel')} {existingSub.score ?? '?'} / {existingSub.max_score ?? maxPoints}
            {pct !== null && ` (${pct}%)`}
          </p>
        </div>
        {existingSub.feedback && (
          <p className="text-sm text-slate-300 italic">{existingSub.feedback}</p>
        )}
        {existingSub.content?.text && (
          <div className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-900 border border-slate-800 rounded-lg p-4">
            {existingSub.content.text}
          </div>
        )}
        {existingSub.content?.file_url && (
          <a
            href={existingSub.content.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 hover:underline font-medium"
          >
            📎 {existingSub.content.file_name ?? t('learning.assignment.attachedFileFallback')}
          </a>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        {submissionType !== 'file' && (
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              {t('learning.assignment.responseFieldLabel')}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder={t('learning.assignment.responsePlaceholder')}
              className="w-full text-sm text-white bg-slate-800 border border-slate-700 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-slate-500 transition"
              aria-label="Assignment response"
            />
            <p className="text-xs text-slate-400 mt-1">
              {t('learning.assignment.charCountHelperTemplate', { n: body.length.toLocaleString(), maxPoints })}
            </p>
          </div>
        )}

        {/* File attachment */}
        {submissionType !== 'text' && (
        <div>
          <p className="text-sm font-semibold text-white mb-2">
            {submissionType === 'file' ? t('learning.assignment.uploadFileTypeLabel') : t('learning.assignment.attachmentTypeLabel')}{' '}
            {submissionType === 'both' && <span className="font-normal text-slate-400">(optional)</span>}
          </p>
          {file ? (
            <div className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5">
              <span className="text-lg" aria-hidden="true">📎</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                aria-label="Remove file"
              >
                {t('learning.assignment.removeFileButton')}
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-3 bg-slate-800/60 border border-dashed border-slate-700 rounded-lg px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors">
              <span className="text-slate-400 text-xl" aria-hidden="true">📤</span>
              <div>
                <p className="text-sm font-medium text-white">{t('learning.assignment.dropzoneLabel')}</p>
                <p className="text-xs text-slate-400">{t('learning.assignment.dropzoneHint')}</p>
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
          {fileErr && <p className="text-xs text-rose-400 mt-1" role="alert">{fileErr}</p>}
        </div>
        )}
      </div>

      {result?.error && (
        <p className="text-sm text-rose-400 font-medium" role="alert">{result.error}</p>
      )}

      <button
        type="submit"
        disabled={
          pending ||
          (submissionType === 'text' && !body.trim()) ||
          (submissionType === 'file' && !file) ||
          (submissionType === 'both' && !body.trim() && !file)
        }
        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {pending ? t('common.submittingButton') : t('learning.assignment.submitButton')}
      </button>
    </form>
  )
}
