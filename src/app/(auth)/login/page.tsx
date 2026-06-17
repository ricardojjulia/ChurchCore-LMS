'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  const wordmark = ['ChurchCore', 'LMS']

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4 overflow-hidden">
      <div className="w-full max-w-4xl flex items-center justify-center gap-10">
        <aside
          aria-label="ChurchCore LMS"
          className="hidden md:flex min-h-[34rem] w-32 shrink-0 items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.03] shadow-2xl shadow-indigo-950/30"
        >
          <div className="relative flex h-full w-full items-center justify-center py-10">
            <div className="absolute inset-y-10 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-indigo-400/60 to-transparent" />
            <div className="relative flex flex-col items-center gap-7">
              {wordmark.map((word) => (
                <div key={word} className="flex flex-col items-center gap-1.5">
                  {word.split('').map((letter, index) => (
                    <span
                      key={`${word}-${letter}-${index}`}
                      className="font-black uppercase leading-none tracking-normal text-white drop-shadow-[0_0_18px_rgba(129,140,248,0.45)]"
                      style={{ fontSize: word === 'LMS' ? '1.35rem' : '1.05rem' }}
                    >
                      {letter}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="w-full max-w-sm">
          <div className="md:hidden mb-5 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.34em] text-indigo-300">ChurchCore LMS</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-slate-950/50">
            <h1 className="text-2xl font-extrabold text-white mb-1">Sign in</h1>
            <p className="text-slate-500 text-sm mb-6">ChurchCore LMS</p>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="••••••••"
                />
              </div>
              {error && <p className="text-rose-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white font-bold rounded-xl py-3 hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  )
}
