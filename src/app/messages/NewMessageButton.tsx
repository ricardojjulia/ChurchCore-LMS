'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { searchUsers, getOrCreateDirectThread } from '@/app/actions/messages'

interface User { uid: string; display_name: string; email: string; role: string }

export default function NewMessageButton() {
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
      <Button onClick={() => setOpen(true)} size="sm">+ New Message</Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); reset() } }}
        >
          <div className="bg-white border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-extrabold text-foreground">New Message</h2>
              <button type="button" onClick={() => { setOpen(false); reset() }}
                className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSend} className="space-y-4">
              {/* Recipient search */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  To <span className="text-destructive">*</span>
                </label>
                {selected ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-input rounded-md bg-primary/5">
                    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                      {selected.display_name[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-foreground">{selected.display_name}</span>
                    <span className="text-xs text-muted-foreground">{selected.email}</span>
                    <button type="button" onClick={() => { setSelected(null); setQuery('') }}
                      className="ml-auto text-muted-foreground hover:text-foreground text-sm">×</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name or email…"
                      className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {results.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
                        {results.map((u) => (
                          <button
                            key={u.uid}
                            type="button"
                            onClick={() => { setSelected(u); setResults([]) }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">
                              {u.display_name[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{u.display_name}</p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
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
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Message <span className="text-destructive">*</span>
                </label>
                <textarea
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  maxLength={10000}
                  placeholder="Write your message…"
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">{body.length}/10000</p>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" variant="ghost" onClick={() => { setOpen(false); reset() }}>Cancel</Button>
                <Button type="submit" disabled={isPending || !selected || !body.trim()}>
                  {isPending ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
