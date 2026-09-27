'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getOrCreateGuardianThread } from '@/app/actions/messages'

// "Message teacher" / "Message guardian" (COUNCIL-2026-035): a small inline
// composer that opens a thread about one student. Who may message whom is
// decided by the database; this only collects the first message.
export default function MessageAboutStudent({
  studentUid,
  recipientUid,
  recipientName,
  label,
}: {
  studentUid: string
  recipientUid: string
  recipientName: string
  label: string
}) {
  const t = useTranslations('messages.aboutStudent')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-expanded={false}
        className="text-xs font-semibold text-indigo-700 underline hover:text-indigo-900">
        {label}
      </button>
    )
  }

  function send(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await getOrCreateGuardianThread(studentUid, recipientUid, body)
      if (res.error || !res.threadId) { setError(res.error ?? t('error')); return }
      router.push(`/messages/${res.threadId}`)
    })
  }

  return (
    <form onSubmit={send} className="mt-2 space-y-2">
      <label className="block text-xs font-semibold text-slate-700" htmlFor={`msg-${studentUid}-${recipientUid}`}>
        {t('to', { name: recipientName })}
      </label>
      <textarea
        id={`msg-${studentUid}-${recipientUid}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={10000}
        required
        className="w-full rounded-md border border-input px-3 py-2 text-sm"
      />
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !body.trim()}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
          {pending ? t('sending') : t('send')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-700">
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}
