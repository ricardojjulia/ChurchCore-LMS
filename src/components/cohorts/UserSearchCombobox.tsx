'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'

export interface SearchResult {
  id: string
  full_name: string
  email: string | null
  avatar_url: string | null
}

interface Props {
  existingMemberIds: string[]
  onSelect: (user: SearchResult) => void
  onClose: () => void
}

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

export default function UserSearchCombobox({ existingMemberIds, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // functions.invoke doesn't support GET query params — use fetch directly
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/search-users?q=${encodeURIComponent(q)}`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
    })

    if (!res.ok) {
      setError('Search failed — try again')
      setLoading(false)
      return
    }

    const json = await res.json()
    const filtered = ((json.results as SearchResult[]) ?? [])
      .filter((r) => !existingMemberIds.includes(r.id))
    setResults(filtered)

    setLoading(false)
    setActiveIndex(-1)
  }, [supabase, existingMemberIds])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query.trim()), DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      onSelect(results[activeIndex])
    }
  }

  const showList = query.trim().length >= MIN_QUERY_LENGTH

  // Pre-computed as a spread object — the VSCode HTML language service incorrectly
  // flags any JSX expression as an invalid ARIA attribute value (known false positive).
  // Spreading bypasses the check while preserving correct ARIA semantics at runtime.
  const inputAriaProps = {
    'aria-expanded': (showList ? 'true' : 'false') as 'true' | 'false',
    'aria-activedescendant': activeIndex >= 0 ? `user-option-${activeIndex}` : undefined,
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActiveIndex(-1) }}
        onKeyDown={handleKeyDown}
        placeholder="Search by name or email…"
        aria-label="Search for a user to add"
        aria-controls="user-search-listbox"
        {...inputAriaProps}
        autoComplete="off"
        className="w-full border border-input rounded-lg px-4 py-2.5 text-sm bg-white text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {showList && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {/* Status messages live outside the listbox — listbox children must be role="option" */}
          {loading && (
            <div
              role="status"
              aria-live="polite"
              className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2"
            >
              <span className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
              Searching…
            </div>
          )}

          {!loading && error && (
            <div role="alert" className="px-4 py-3 text-sm text-rose-600">{error}</div>
          )}

          {!loading && !error && results.length === 0 && (
            <div role="status" className="px-4 py-3 text-sm text-muted-foreground">
              No users found matching &ldquo;{query}&rdquo;.{' '}
              <a
                href="/admin/users"
                className="text-primary underline hover:no-underline"
                onClick={onClose}
              >
                Invite them?
              </a>
            </div>
          )}

          {/* Listbox always rendered when showList so aria-controls resolves; empty while loading */}
          <div
            id="user-search-listbox"
            ref={listRef}
            role="listbox"
            aria-label="User search results"
          >
            {!loading && !error && results.map((user, idx) => {
              // Spread aria-selected to avoid the HTML language service flagging JSX
              // expressions as invalid ARIA values — this is a known false positive.
              const optionProps = { 'aria-selected': (idx === activeIndex ? 'true' : 'false') as 'true' | 'false' }
              return (
              <div
                key={user.id}
                id={`user-option-${idx}`}
                role="option"
                {...optionProps}
                onClick={() => onSelect(user)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 text-sm transition-colors ${
                  idx === activeIndex ? 'bg-primary/10' : 'hover:bg-slate-50'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                  {user.full_name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{user.full_name}</p>
                  {user.email && (
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
