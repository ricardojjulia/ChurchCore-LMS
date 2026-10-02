'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition, useRef } from 'react'

const ROLES = ['all', 'admin', 'manager', 'teacher', 'student'] as const

const ROLE_ACTIVE: Record<string, string> = {
  all:     'bg-indigo-600 text-white border-indigo-500',
  admin:   'bg-indigo-950/60 text-indigo-400 border-indigo-800',
  manager: 'bg-purple-950/60 text-purple-400 border-purple-800',
  teacher: 'bg-sky-950/60 text-sky-400 border-sky-800',
  student: 'bg-emerald-950/60 text-emerald-400 border-emerald-800',
}

export default function UsersControls({ total: _total }: { total: number }) {
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
      <input aria-label="Search users"
        type="search"
        defaultValue={currentQ}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search by name or email…"
        className="flex-1 border border-slate-700 rounded-lg px-4 py-2 text-sm bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                : 'border-slate-700 text-slate-400 bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}
