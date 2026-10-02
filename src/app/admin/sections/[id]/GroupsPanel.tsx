'use client'

import { useState, useTransition } from 'react'
import { createGroup, deleteGroup, addGroupMember, removeGroupMember } from '@/app/actions/groups'

const PURPOSE_LABELS: Record<string, string> = {
  collaboration: 'Collaboration',
  grading:       'Grading',
  project:       'Project',
  discussion:    'Discussion',
  lab:           'Lab',
  general:       'General',
}

interface GroupMember {
  id: string
  user_id: string
  role: 'member' | 'leader'
}

interface Group {
  id: string
  group_name: string
  group_code: string | null
  purpose: string | null
  max_members: number | null
  created_at: string
  section_group_members: GroupMember[]
}

interface Props {
  sectionId:     string
  initialGroups: Group[]
  isAdmin:       boolean
}

export default function GroupsPanel({ sectionId, initialGroups, isAdmin }: Props) {
  const [showCreate, setShowCreate] = useState(false)
  const [createErr,  setCreateErr]  = useState<string | null>(null)
  const [addUid,     setAddUid]     = useState<Record<string, string>>({})
  const [addErr,     setAddErr]     = useState<Record<string, string | null>>({})
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [pending,    start]         = useTransition()

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setCreateErr(null)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const result = await createGroup(sectionId, fd)
      if (result.error) { setCreateErr(result.error); return }
      setShowCreate(false)
      ;(e.target as HTMLFormElement).reset()
    })
  }

  function handleDelete(groupId: string) {
    if (!confirm('Delete this group and all its members?')) return
    start(async () => { await deleteGroup(sectionId, groupId) })
  }

  function handleAddMember(groupId: string) {
    const uid = (addUid[groupId] ?? '').trim()
    if (!uid) return
    setAddErr((p) => ({ ...p, [groupId]: null }))
    start(async () => {
      const result = await addGroupMember(sectionId, groupId, uid)
      if (result.error) { setAddErr((p) => ({ ...p, [groupId]: result.error! })); return }
      setAddUid((p) => ({ ...p, [groupId]: '' }))
    })
  }

  function handleRemoveMember(groupId: string, userId: string) {
    start(async () => { await removeGroupMember(sectionId, groupId, userId) })
  }

  return (
    <section className="space-y-4 text-slate-100">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">
          Groups
        </h2>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1 bg-indigo-600 text-white font-bold px-3 py-1.5 rounded-xl text-sm hover:bg-indigo-500 transition-colors"
        >
          {showCreate ? '✕ Cancel' : '+ New Group'}
        </button>
      </div>

      {/* Create group form */}
      {showCreate && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-white mb-4">New Group</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            {createErr && (
              <p className="text-rose-300 text-sm bg-rose-950/40 border border-rose-800 rounded-lg p-3">{createErr}</p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="group_name">
                  Name <span className="text-rose-400">*</span>
                </label>
                <input id="group_name" name="group_name" required placeholder="e.g. Team Alpha" className="input w-full bg-slate-800 border-slate-700 text-white placeholder-slate-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="group_code">
                  Code
                </label>
                <input id="group_code" name="group_code" placeholder="e.g. GRP-A" className="input w-full font-mono bg-slate-800 border-slate-700 text-white placeholder-slate-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="purpose">
                  Purpose
                </label>
                <select id="purpose" name="purpose" className="input w-full bg-slate-800 border-slate-700 text-white">
                  <option value="">— None —</option>
                  {Object.entries(PURPOSE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="max_members">
                  Max members
                </label>
                <input
                  id="max_members"
                  name="max_members"
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  className="input w-full bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-xl text-sm hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                {pending ? 'Creating…' : 'Create Group'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Group cards */}
      {initialGroups.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center">
          <p className="text-slate-400 text-sm italic">No groups yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {initialGroups.map((g) => {
            const isExpanded    = expanded === g.id
            const memberCount   = g.section_group_members?.length ?? 0
            const atCapacity    = g.max_members != null && memberCount >= g.max_members

            return (
              <div key={g.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                {/* Group header row */}
                <div className="flex items-center gap-4 px-6 py-4">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : g.id)}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    <span className="font-bold text-white">{g.group_name}</span>
                    {g.group_code && (
                      <span className="text-xs font-mono text-slate-400 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded">
                        {g.group_code}
                      </span>
                    )}
                    {g.purpose && (
                      <span className="text-xs text-indigo-300 bg-indigo-950/60 border border-indigo-800 px-2 py-0.5 rounded font-semibold">
                        {PURPOSE_LABELS[g.purpose] ?? g.purpose}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 ml-auto">
                      {memberCount}{g.max_members ? `/${g.max_members}` : ''} member{memberCount !== 1 ? 's' : ''}
                      {atCapacity && <span className="text-amber-400 font-semibold ml-1">· Full</span>}
                    </span>
                    <span className="text-slate-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(g.id)}
                      disabled={pending}
                      className="text-xs text-rose-400 hover:text-rose-300 font-semibold shrink-0 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {/* Expanded member list + add member */}
                {isExpanded && (
                  <div className="border-t border-slate-800 px-6 pb-5 pt-4 space-y-4 bg-slate-950/40">
                    {/* Current members */}
                    {memberCount > 0 ? (
                      <ul className="divide-y divide-slate-800">
                        {g.section_group_members.map((m) => (
                          <li key={m.id} className="flex items-center justify-between py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-slate-400">{m.user_id}</span>
                              {m.role === 'leader' && (
                                <span className="text-xs font-semibold bg-amber-950/50 text-amber-400 border border-amber-800 px-1.5 py-0.5 rounded">
                                  Leader
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleRemoveMember(g.id, m.user_id)}
                              disabled={pending}
                              className="text-xs text-rose-400 hover:text-rose-300 font-semibold disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-400 italic">No members yet.</p>
                    )}

                    {/* Add member */}
                    {!atCapacity && (
                      <div className="flex gap-2 pt-1">
                        <input
                          value={addUid[g.id] ?? ''}
                          onChange={(e) => setAddUid((p) => ({ ...p, [g.id]: e.target.value }))}
                          placeholder="User UUID"
                          className="input flex-1 font-mono text-xs bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                          aria-label="User UUID to add to group"
                        />
                        <button
                          onClick={() => handleAddMember(g.id)}
                          disabled={pending || !(addUid[g.id] ?? '').trim()}
                          className="bg-indigo-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-indigo-500 transition-colors disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    )}
                    {addErr[g.id] && (
                      <p className="text-rose-400 text-xs">{addErr[g.id]}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
