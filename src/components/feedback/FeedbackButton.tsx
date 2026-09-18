'use client'

import { useState } from 'react'
import { useFeedbackSession } from './FeedbackSessionProvider'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'

const CATEGORIES = [
  { value: 'BUG',               label: 'Bug' },
  { value: 'ERROR',             label: 'Error / Crash' },
  { value: 'UNEXPECTED_RESULT', label: 'Unexpected Result' },
  { value: 'IMPROVEMENT',       label: 'Improvement Idea' },
] as const

type Category = typeof CATEGORIES[number]['value']

type SubmitState = 'idle' | 'loading' | 'success' | 'error'

const NOTE_MAX = 1000

export function FeedbackButton() {
  // Gate: renders nothing when demo mode is off.
  if (!DEMO_MODE) return null

  return <ActiveFeedbackButton />
}

function ActiveFeedbackButton() {
  const { sessionId, breadcrumbs, elapsedSeconds } = useFeedbackSession()
  const [open, setOpen]       = useState(false)
  const [category, setCategory] = useState<Category | ''>('')
  const [note, setNote]       = useState('')
  const [status, setStatus]   = useState<SubmitState>('idle')

  function handleOpen() {
    setOpen(true)
    setStatus('idle')
    setCategory('')
    setNote('')
  }

  function handleClose() {
    setOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!category || !sessionId) return
    setStatus('loading')

    try {
      const res = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          route:                  window.location.pathname,
          category,
          note:                   note.trim() || undefined,
          breadcrumbs,
          appVersion:             APP_VERSION,
          sessionDurationSeconds: elapsedSeconds,
        }),
      })

      if (!res.ok) {
        setStatus('error')
      } else {
        setStatus('success')
        setTimeout(() => setOpen(false), 1500)
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      {/* Trigger button — always visible in demo mode */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Send feedback"
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        {/* Megaphone / flag icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
          <path d="M3 4a1 1 0 0 0-2 0v12a1 1 0 0 0 2 0v-4h.5l3.38 3.79A1 1 0 0 0 8.62 16H9a1 1 0 0 0 1-1v-4.382l5.553 2.776A1 1 0 0 0 17 12.382V7.618a1 1 0 0 0-1.447-.894L10 9.382V5a1 1 0 0 0-1-1h-.38a1 1 0 0 0-.758.348L4.5 8H3V4z" />
        </svg>
      </button>

      {/* Modal backdrop + dialog */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Send feedback"
          className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-center"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Send Feedback
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close feedback dialog"
                className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {status === 'success' ? (
                <p className="py-6 text-center text-sm text-green-600 font-medium">
                  Thank you! Your feedback was received.
                </p>
              ) : (
                <>
                  <div>
                    <label htmlFor="fb-category" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Category <span aria-hidden="true" className="text-red-500">*</span>
                    </label>
                    <select
                      id="fb-category"
                      required
                      value={category}
                      onChange={e => setCategory(e.target.value as Category)}
                      className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="" disabled>Select a category…</option>
                      {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="fb-note" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Notes <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      id="fb-note"
                      rows={4}
                      maxLength={NOTE_MAX}
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Describe what you saw or what you expected to happen…"
                      className="w-full resize-none rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <p className="mt-1 text-right text-xs text-slate-400">
                      {note.length}/{NOTE_MAX}
                    </p>
                  </div>

                  {status === 'error' && (
                    <p className="text-xs text-red-600">
                      Something went wrong — please try again.
                    </p>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!category || status === 'loading'}
                      className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                    >
                      {status === 'loading' ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  )
}
