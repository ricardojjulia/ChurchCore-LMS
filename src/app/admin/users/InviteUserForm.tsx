'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { inviteUser } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'

type UserRole = 'admin' | 'manager' | 'teacher' | 'student'

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'student',  label: 'Student' },
  { value: 'teacher',  label: 'Teacher' },
  { value: 'manager',  label: 'Manager' },
  { value: 'admin',    label: 'Admin' },
]

export default function InviteUserForm() {
  const [open, setOpen]         = useState(false)
  const [email, setEmail]       = useState('')
  const [role, setRole]         = useState<UserRole>('student')
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState(false)
  const [isPending, start]      = useTransition()
  const emailRef                = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) emailRef.current?.focus() }, [open])

  function reset() { setEmail(''); setRole('student'); setError(null); setSuccess(false) }

  function handleClose() { setOpen(false); reset() }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    start(async () => {
      const res = await inviteUser(email.trim(), role)
      if (res.error) { setError(res.error); return }
      setSuccess(true)
      setEmail('')
      setTimeout(() => { setOpen(false); reset() }, 1800)
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        + Invite User
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div className="bg-white border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-extrabold text-foreground">Invite User</h2>
              <button
                type="button"
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground text-xl leading-none"
              >
                ×
              </button>
            </div>

            {success ? (
              <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                Invitation sent to <strong>{email}</strong>. They will receive a magic-link email.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Email address <span className="text-destructive">*</span>
                  </label>
                  <input
                    ref={emailRef}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Role</label>
                  <div className="flex gap-2 flex-wrap">
                    {ROLES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRole(value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          role === value
                            ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                            : 'border-border text-muted-foreground hover:bg-slate-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-3 pt-1">
                  <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
                  <Button type="submit" disabled={isPending || !email.trim()}>
                    {isPending ? 'Sending…' : 'Send Invitation'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
