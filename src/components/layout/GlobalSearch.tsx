'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Course        { id: string; title: string; description: string | null }
interface Announcement  { id: string; title: string; body: string | null }
interface Person        { uid: string; display_name: string | null; email: string | null; role: string }

interface SearchResults {
  courses:       Course[]
  announcements: Announcement[]
  people:        Person[]
}

const EMPTY: SearchResults = { courses: [], announcements: [], people: [] }

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-primary rounded-sm">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

export default function GlobalSearch() {
  const [open,     setOpen]     = useState(false)
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<SearchResults>(EMPTY)
  const [selected, setSelected] = useState(0)
  const [, start]               = useTransition()
  const inputRef                = useRef<HTMLInputElement>(null)
  const debounce                = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router                  = useRouter()

  // cmd+K / ctrl+K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => {
          if (!v) setTimeout(() => inputRef.current?.focus(), 50)
          return !v
        })
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const fetch = useCallback((q: string) => {
    if (q.length < 2) { setResults(EMPTY); return }
    start(async () => {
      const res = await window.fetch(`/api/search?q=${encodeURIComponent(q)}`)
      if (res.ok) setResults(await res.json())
    })
  }, [])

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    setSelected(0)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => fetch(q), 200)
  }

  // Flatten results for keyboard nav
  const allItems: { href: string; label: string }[] = [
    ...results.courses.map((c) => ({ href: `/courses/${c.id}`, label: c.title })),
    ...results.announcements.map((a) => ({ href: `/announcements#${a.id}`, label: a.title })),
    ...results.people.map((p) => ({ href: `/admin/users`, label: p.display_name ?? p.email ?? '' })),
  ]

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, allItems.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    if (e.key === 'Enter') {
      const item = allItems[selected]
      if (item) { router.push(item.href); setOpen(false) }
    }
  }

  function go(href: string) { router.push(href); setOpen(false); setQuery(''); setResults(EMPTY) }

  const hasResults = results.courses.length + results.announcements.length + results.people.length > 0

  let itemIdx = 0

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
        className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-1.5 transition-colors"
        aria-label="Open search"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden sm:inline text-[10px] bg-slate-700 rounded px-1 py-0.5 text-slate-400">⌘K</kbd>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden mx-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Search"
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={onInput}
                onKeyDown={onKeyDown}
                placeholder="Search courses, announcements, people…"
                className="flex-1 text-sm text-foreground placeholder:text-muted-foreground outline-none bg-transparent"
                autoComplete="off"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setResults(EMPTY); inputRef.current?.focus() }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              )}
              <kbd className="text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">Esc</kbd>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto">
              {query.length < 2 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Type at least 2 characters to search</p>
              ) : !hasResults ? (
                <p className="text-sm text-muted-foreground text-center py-8">No results for &ldquo;{query}&rdquo;</p>
              ) : (
                <div className="py-2">
                  {results.courses.length > 0 && (
                    <ResultSection label="Courses">
                      {results.courses.map((c) => {
                        const i = itemIdx++
                        return (
                          <ResultItem
                            key={c.id}
                            icon="🎓"
                            label={highlight(c.title, query)}
                            sub={c.description ? `${c.description.slice(0, 60)}…` : undefined}
                            selected={selected === i}
                            onClick={() => go(`/courses/${c.id}`)}
                          />
                        )
                      })}
                    </ResultSection>
                  )}

                  {results.announcements.length > 0 && (
                    <ResultSection label="Announcements">
                      {results.announcements.map((a) => {
                        const i = itemIdx++
                        return (
                          <ResultItem
                            key={a.id}
                            icon="📢"
                            label={highlight(a.title, query)}
                            sub={a.body ? `${a.body.slice(0, 60)}…` : undefined}
                            selected={selected === i}
                            onClick={() => go(`/announcements`)}
                          />
                        )
                      })}
                    </ResultSection>
                  )}

                  {results.people.length > 0 && (
                    <ResultSection label="People">
                      {results.people.map((p) => {
                        const i = itemIdx++
                        return (
                          <ResultItem
                            key={p.uid}
                            icon="👤"
                            label={highlight(p.display_name ?? p.email ?? 'Unknown', query)}
                            sub={`${p.role} · ${p.email ?? ''}`}
                            selected={selected === i}
                            onClick={() => go('/admin/users')}
                          />
                        )
                      })}
                    </ResultSection>
                  )}
                </div>
              )}
            </div>

            {/* Footer hints */}
            <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
              <span><kbd className="bg-muted rounded px-1">↑↓</kbd> navigate</span>
              <span><kbd className="bg-muted rounded px-1">↵</kbd> open</span>
              <span><kbd className="bg-muted rounded px-1">Esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ResultSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 py-1.5">
        {label}
      </p>
      {children}
    </div>
  )
}

function ResultItem({
  icon, label, sub, selected, onClick,
}: {
  icon:     string
  label:    React.ReactNode
  sub?:     string
  selected: boolean
  onClick:  () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
        selected ? 'bg-primary/10' : 'hover:bg-slate-50'
      )}
    >
      <span className="text-base shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground font-medium truncate">{label}</p>
        {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
      </div>
      <span className="text-muted-foreground text-xs shrink-0">→</span>
    </button>
  )
}
