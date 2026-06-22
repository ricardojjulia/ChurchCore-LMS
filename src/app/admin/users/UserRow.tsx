'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { updateUserRole, updateUserStatus, deleteUser } from '@/app/actions/admin'
import { cn } from '@/lib/utils'

type UserRole   = 'admin' | 'manager' | 'teacher' | 'student'
type UserStatus = 'active' | 'suspended' | 'pending' | 'archived'

interface Profile {
  uid:          string
  display_name: string
  email:        string
  role:         UserRole
  status:       UserStatus
  student_id:   string | null
  xp_points:    number
  current_level: number
}

const ROLES:    UserRole[]   = ['admin', 'manager', 'teacher', 'student']
const STATUSES: UserStatus[] = ['active', 'suspended', 'pending', 'archived']

const ROLE_COLOR: Record<UserRole, string> = {
  admin:   'bg-indigo-100 text-indigo-800 border-indigo-200',
  manager: 'bg-purple-100 text-purple-800 border-purple-200',
  teacher: 'bg-sky-100    text-sky-800    border-sky-200',
  student: 'bg-slate-100  text-slate-700  border-slate-200',
}

const STATUS_COLOR: Record<UserStatus, string> = {
  active:    'bg-emerald-100 text-emerald-800 border-emerald-200',
  suspended: 'bg-rose-100    text-rose-800    border-rose-200',
  pending:   'bg-amber-100   text-amber-800   border-amber-200',
  archived:  'bg-slate-100   text-slate-500   border-slate-200',
}

export default function UserRow({ profile }: { profile: Profile }) {
  const [open, setOpen]               = useState(false)
  const [role, setRole]               = useState(profile.role)
  const [status, setStatus]           = useState(profile.status)
  const [error, setError]             = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition]  = useTransition()

  const initial = profile.display_name?.[0]?.toUpperCase() ?? '?'

  async function handleRoleChange(newRole: UserRole) {
    if (newRole === role) return
    setError(null)
    startTransition(async () => {
      const res = await updateUserRole(profile.uid, newRole)
      if (res.error) { setError(res.error); return }
      setRole(newRole)
    })
  }

  async function handleStatusChange(newStatus: UserStatus) {
    if (newStatus === status) return
    setError(null)
    startTransition(async () => {
      const res = await updateUserStatus(profile.uid, newStatus)
      if (res.error) { setError(res.error); return }
      setStatus(newStatus)
    })
  }

  async function handleDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteUser(profile.uid)
      if (res.error) { setError(res.error); setConfirmDelete(false) }
      // On success the page revalidates and this row disappears
    })
  }

  return (
    <div className="border border-border rounded-xl bg-white overflow-hidden">
      {/* Row summary */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground truncate">{profile.display_name}</p>
          <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
        </div>

        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn('text-xs', ROLE_COLOR[role])}>{role}</Badge>
          <Badge variant="outline" className={cn('text-xs', STATUS_COLOR[status])}>{status}</Badge>
        </div>

        {profile.student_id && (
          <span className="hidden md:block text-xs font-mono text-muted-foreground shrink-0">
            {profile.student_id}
          </span>
        )}

        <span className="text-slate-400 text-sm shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {/* Expanded edit panel */}
      {open && (
        <div className="border-t border-border px-5 py-4 bg-slate-50 space-y-4">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Role selector */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Role</p>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    disabled={isPending}
                    onClick={() => handleRoleChange(r)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50',
                      role === r
                        ? ROLE_COLOR[r]
                        : 'border-border text-muted-foreground hover:bg-slate-100'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Status selector */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    disabled={isPending}
                    onClick={() => handleStatusChange(s)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50',
                      status === s
                        ? STATUS_COLOR[s]
                        : 'border-border text-muted-foreground hover:bg-slate-100'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stats + delete */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border">
            <span>Level <strong className="text-foreground">{profile.current_level}</strong></span>
            <span><strong className="text-foreground">{profile.xp_points}</strong> XP</span>
            {profile.student_id && (
              <span>ID <strong className="font-mono text-foreground">{profile.student_id}</strong></span>
            )}
            <Link
              href={`/admin/users/${profile.uid}`}
              className="text-xs text-primary hover:underline font-medium"
            >
              View engagement →
            </Link>
            {isPending && <span className="ml-auto">Saving…</span>}

            <div className="ml-auto flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-xs text-destructive font-semibold">Delete permanently?</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={handleDelete}
                    className="h-7 text-xs"
                  >
                    {isPending ? 'Deleting…' : 'Yes, delete'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => setConfirmDelete(false)}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors font-medium"
                >
                  Delete user
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
