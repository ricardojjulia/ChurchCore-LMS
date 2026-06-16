'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { addCohortMember, removeCohortMember, searchCohortMembers } from '@/app/actions/cohorts'
import UserSearchCombobox from '@/components/cohorts/UserSearchCombobox'
import type { SearchResult } from '@/components/cohorts/UserSearchCombobox'

interface Member {
  id: string
  user_id: string
  status: string
  joined_at: string
  notes: string | null
  auth_user: { email: string } | null
}

interface Props {
  cohortId: string
  members:  Member[]
}

// Matches UsersControls debounce timing exactly (300 ms)
const DEBOUNCE_MS = 300

// Client-side threshold: above this, fall back to server-side search
const SERVER_SEARCH_THRESHOLD = 200

export default function CohortMemberPanel({ cohortId, members }: Props) {
  const [addErr,    setAddErr]    = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState<string | null>(null)
  const [query,     setQuery]     = useState('')
  const [filtered,  setFiltered]  = useState<Member[]>(members)
  const [serverBusy, setServerBusy] = useState(false)
  const [pending,   startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      const q = query.trim()

      if (!q) {
        setFiltered(members)
        return
      }

      if (members.length <= SERVER_SEARCH_THRESHOLD) {
        // Client-side filter — sufficient for most cohorts
        const lower = q.toLowerCase()
        setFiltered(
          members.filter(
            (m) =>
              (m.auth_user?.email?.toLowerCase().includes(lower) ?? false) ||
              m.user_id.toLowerCase().includes(lower),
          ),
        )
      } else {
        // Server-side query — cohort_id in WHERE clause enforced in the action
        setServerBusy(true)
        searchCohortMembers(cohortId, q)
          .then(setFiltered)
          .finally(() => setServerBusy(false))
      }
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, members, cohortId])

  const activeMembers   = filtered.filter((m) => m.status === 'active')
  const inactiveMembers = filtered.filter((m) => m.status !== 'active')
  const isSearching     = query.trim().length > 0

  const countLabel = isSearching
    ? `${filtered.length} of ${members.length} members`
    : `${members.length} members`

  function handleSelectUser(user: SearchResult) {
    setAddErr(null)
    setAddSuccess(null)
    startTransition(async () => {
      const result = await addCohortMember(cohortId, user.id)
      if (result.error) {
        setAddErr(result.error)
      } else {
        setAddSuccess(`${user.full_name} added to cohort`)
        setTimeout(() => setAddSuccess(null), 3000)
      }
    })
  }

  function handleRemove(userId: string) {
    startTransition(async () => {
      await removeCohortMember(cohortId, userId)
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">
          Members{' '}
          <span className="text-muted-foreground font-normal text-base">
            ({countLabel})
          </span>
        </h2>
      </div>

      {/* Search */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
        placeholder="Search by email or user ID…"
        aria-label="Search cohort members"
        className="flex-1 border border-input rounded-lg px-4 py-2 text-sm bg-white text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full"
      />
      {serverBusy && (
        <p className="text-xs text-muted-foreground">Searching…</p>
      )}

      {/* Add member — search by name or email */}
      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Add Member</h3>
        <UserSearchCombobox
          existingMemberIds={members.map((m) => m.user_id)}
          onSelect={handleSelectUser}
          onClose={() => {}}
        />
        {addErr && (
          <p className="text-rose-600 text-xs mt-2" role="alert">{addErr}</p>
        )}
        {addSuccess && (
          <p className="text-emerald-600 text-xs mt-2 font-semibold" role="status">
            ✓ {addSuccess}
          </p>
        )}
        {pending && (
          <p className="text-xs text-muted-foreground mt-2">Adding…</p>
        )}
      </div>

      {/* Active members table */}
      {activeMembers.length > 0 ? (
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                <th className="text-left px-6 py-3 font-semibold text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Joined</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activeMembers.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3">
                    <p className="font-medium text-foreground">{m.auth_user?.email ?? '—'}</p>
                    <p className="text-xs text-muted-foreground font-mono">{m.user_id}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(m.joined_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                      {m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(m.user_id)}
                      disabled={pending}
                      className="text-xs text-rose-600 hover:text-rose-800 font-semibold disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground text-sm italic">
            {isSearching
              ? 'No members found matching your search.'
              : 'No active members yet.'}
          </p>
        </div>
      )}

      {/* Withdrawn / inactive */}
      {inactiveMembers.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground font-medium hover:text-foreground list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
            {inactiveMembers.length} withdrawn / inactive
          </summary>
          <div className="mt-2 bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {inactiveMembers.map((m) => (
                  <tr key={m.id} className="opacity-60">
                    <td className="px-6 py-3">
                      <p className="font-medium text-foreground">{m.auth_user?.email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  )
}
