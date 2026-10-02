'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { searchUsers, getOrCreateDirectThread } from '@/app/actions/messages'
import { useTranslations } from 'next-intl'

interface User { uid: string; display_name: string; email: string; role: string }

export default function NewMessageButton() {
  const t = useTranslations()
  const [open, setOpen]         = useState(false)
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<User[]>([])
  const [selected, setSelected] = useState<User | null>(null)
  const [body, setBody]         = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [isPending, start]      = useTransition()
  const inputRef                = useRef<HTMLInputElement>(null)
  const router                  = useRouter()

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      start(async () => {
        const data = await searchUsers(query)
        setResults(data as User[])
      })
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  function reset() {
    setQuery(''); setResults([]); setSelected(null); setBody(''); setError(null)
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setError(null)
    start(async () => {
      const res = await getOrCreateDirectThread(selected.uid, body)
      if (res.error) { setError(res.error); return }
      setOpen(false); reset()
      router.push(`/messages/${res.threadId}`)
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">{t('messages.newMessage.triggerButton')}</Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); reset() } }}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 text-slate-100">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-extrabold text-white">{t('messages.newMessage.dialogHeading')}</h2>
              <button type="button" onClick={() => { setOpen(false); reset() }}
                className="text-slate-400 hover:text-white text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSend} className="space-y-4">
              {/* Recipient search */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-1">
                  {t('messages.newMessage.toLabel')} <span className="text-rose-400">*</span>
                </label>
                {selected ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-slate-700 rounded-md bg-indigo-950/40 text-slate-200">
                    <div className="w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-400 font-bold text-xs flex items-center justify-center shrink-0">
                      {selected.display_name[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-white">{selected.display_name}</span>
                    <span className="text-xs text-slate-400">{selected.email}</span>
                    <button type="button" onClick={() => { setSelected(null); setQuery('') }}
                      className="ml-auto text-slate-400 hover:text-white text-sm">×</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input aria-label={t('messages.newMessage.searchPlaceholder')}
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('messages.newMessage.searchPlaceholder')}
                      className="w-full border border-slate-700 rounded-md px-3 py-2 text-sm bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {results.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden divide-y divide-slate-800">
                        {results.map((u) => (
                          <button
                            key={u.uid}
                            type="button"
                            onClick={() => { setSelected(u); setResults([]) }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-800/80 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 font-bold text-sm flex items-center justify-center shrink-0">
                              {u.display_name[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">{u.display_name}</p>
                              <p className="text-xs text-slate-400">{u.email}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Message body */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-1">
                  {t('messages.newMessage.messageLabel')} <span className="text-rose-400">*</span>
                </label>
                <textarea aria-label={t('messages.newMessage.messageLabel')}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  maxLength={10000}
                  placeholder={t('messages.newMessage.messagePlaceholder')}
                  className="w-full border border-slate-700 rounded-md px-3 py-2 text-sm bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <p className="text-xs text-slate-500 mt-1 text-right">{body.length}/10000</p>
              </div>

              {error && (
                <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-800 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-800" onClick={() => { setOpen(false); reset() }}>{t('common.cancel')}</Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white" disabled={isPending || !selected || !body.trim()}>
                  {isPending ? t('messages.newMessage.sendingButton') : t('messages.newMessage.sendButton')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
