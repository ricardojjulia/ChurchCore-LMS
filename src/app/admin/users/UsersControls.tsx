'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition, useRef } from 'react'

const ROLES = ['all', 'admin', 'manager', 'teacher', 'student'] as const

const ROLE_ACTIVE: Record<string, string> = {
  all:     'bg-slate-800 text-white border-slate-700',
  admin:   'bg-indigo-100 text-indigo-800 border-indigo-300',
  manager: 'bg-purple-100 text-purple-800 border-purple-300',
  teacher: 'bg-sky-100 text-sky-800 border-sky-300',
  student: 'bg-emerald-100 text-emerald-800 border-emerald-300',
}

export default function UsersControls({ total }: { total: number }) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentRole = searchParams.get('role') ?? 'all'
  const currentQ    = searchParams.get('q') ?? ''

  function push(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    params.delete('page') // reset to page 1 on filter change
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  function handleSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => push({ q: value }), 300)
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-4">
      {/* Search */}
      <input
        type="search"
        defaultValue={currentQ}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search by name or email…"
        className="flex-1 border border-input rounded-lg px-4 py-2 text-sm bg-white text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {/* Role filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {ROLES.map((r) => (
          <button
            key={r}
            onClick={() => push({ role: r === 'all' ? '' : r })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition-all ${
              currentRole === r || (r === 'all' && currentRole === 'all')
                ? ROLE_ACTIVE[r]
                : 'border-border text-muted-foreground bg-white hover:bg-slate-50'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}
