'use client'

import { useState, useTransition } from 'react'
import { addCohortMember, removeCohortMember } from '@/app/actions/cohorts'

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
  members: Member[]
}

export default function CohortMemberPanel({ cohortId, members }: Props) {
  const [addUid, setAddUid]   = useState('')
  const [addErr, setAddErr]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const activeMembers    = members.filter((m) => m.status === 'active')
  const inactiveMembers  = members.filter((m) => m.status !== 'active')

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addUid.trim()) return
    setAddErr(null)
    startTransition(async () => {
      const result = await addCohortMember(cohortId, addUid.trim())
      if (result.error) setAddErr(result.error)
      else setAddUid('')
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
          Members <span className="text-muted-foreground font-normal text-base">({activeMembers.length} active)</span>
        </h2>
      </div>

      {/* Add member */}
      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Add Member by User ID</h3>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            value={addUid}
            onChange={(e) => setAddUid(e.target.value)}
            placeholder="auth.users UUID"
            className="input flex-1 font-mono text-xs"
            aria-label="User UUID to add"
          />
          <button
            type="submit"
            disabled={pending || !addUid.trim()}
            className="bg-primary text-primary-foreground font-bold px-4 py-2 rounded-xl text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </form>
        {addErr && <p className="text-rose-600 text-xs mt-2">{addErr}</p>}
        <p className="text-xs text-muted-foreground mt-2">
          Paste the UUID from <span className="font-mono">auth.users</span> — user lookup by email coming in Phase 2.
        </p>
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
                <th className="px-4 py-3" />
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
          <p className="text-muted-foreground text-sm italic">No active members yet.</p>
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
