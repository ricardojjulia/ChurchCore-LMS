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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-extrabold text-white">Invite User</h2>
              <button
                type="button"
                onClick={handleClose}
                className="text-slate-400 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            {success ? (
              <div className="text-sm text-emerald-400 bg-emerald-950/50 border border-emerald-800 rounded-lg px-4 py-3">
                Invitation sent to <strong>{email}</strong>. They will receive a magic-link email.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">
                    Email address <span className="text-rose-400">*</span>
                  </label>
                  <input aria-label="Email address"
                    ref={emailRef}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Role</label>
                  <div className="flex gap-2 flex-wrap">
                    {ROLES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRole(value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          role === value
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'border-slate-700 text-slate-400 bg-slate-800 hover:bg-slate-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-rose-400 bg-rose-950/50 border border-rose-800 rounded-md px-3 py-2">
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-3 pt-1">
                  <Button type="button" variant="ghost" onClick={handleClose} className="text-slate-400 hover:text-white">Cancel</Button>
                  <Button type="submit" disabled={isPending || !email.trim()} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
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
