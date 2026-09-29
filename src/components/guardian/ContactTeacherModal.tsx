'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendGuardianTeacherMessage } from '@/app/actions/messages'

interface Props {
  studentUid:  string
  studentName: string
  courseId:    string
  courseTitle: string
}

export default function ContactTeacherModal({
  studentUid,
  studentName,
  courseId,
  courseTitle,
}: Props) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await sendGuardianTeacherMessage({
        studentUid,
        courseId,
        message,
      })

      if (res.error) {
        setError(res.error)
        return
      }

      setIsOpen(false)
      setMessage('')
      if (res.threadId) {
        router.push(`/messages/${res.threadId}`)
      } else {
        router.push('/messages')
      }
    } catch {
      setError('Failed to send message. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded-lg transition-colors"
      >
        <span aria-hidden="true">💬</span>
        <span>Contact Instructor</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-teacher-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 id="contact-teacher-title" className="text-lg font-bold text-slate-900 dark:text-white">
                  Message Instructor
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Regarding <strong>{studentName}</strong> in <em>{courseTitle}</em>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div role="alert" className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 dark:text-red-300 text-xs rounded-xl">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="guardian-message" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Your Message
                </label>
                <textarea
                  id="guardian-message"
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Hi, I have a question regarding my student's recent assignments and progress..."
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl p-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !message.trim()}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/20 border-t-white" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <span>Send Inquiry</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
