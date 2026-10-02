'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Turnstile } from '@marsidev/react-turnstile'
import { createClient } from '@/utils/supabase/client'
import { signupTenant } from '@/app/actions/tenant-signup'

export default function SignupForm() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [password, setPassword] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Auto-generate slug from organization name if not manually edited
  function handleOrgNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setOrgName(val)
    if (!slugManuallyEdited) {
      const generated = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30)
      setOrgSlug(generated)
    }
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugManuallyEdited(true)
    const val = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
    setOrgSlug(val)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    setLoading(true)
    try {
      const result = await signupTenant({
        orgName,
        orgSlug,
        adminName,
        adminEmail,
        password,
        turnstileToken: turnstileToken ?? 'mock-token',
      })

      if (result.error) {
        setError(result.error)
        return
      }

      // Auto sign-in with the created admin account
      const supabase = createClient()
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password,
      })

      if (signInErr) {
        // Redirect to login if auto-signin doesn't succeed synchronously
        router.push('/login?registered=1')
        return
      }

      router.push('/dashboard')
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-red-300 text-sm"
        >
          {error}
        </div>
      )}

      {/* Organization Details */}
      <div className="space-y-3 pt-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Organization Details
        </h3>

        <div>
          <label htmlFor="orgName" className="block text-sm font-medium mb-1 text-slate-200">
            Organization or Church Name
          </label>
          <input
            id="orgName"
            type="text"
            required
            value={orgName}
            onChange={handleOrgNameChange}
            placeholder="Grace Community Church or Trinity Seminary"
            className="w-full border border-slate-700 bg-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>

        <div>
          <label htmlFor="orgSlug" className="block text-sm font-medium mb-1 text-slate-200">
            Workspace URL Slug
          </label>
          <div className="flex items-center rounded-xl border border-slate-700 bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 shadow-sm">
            <span className="px-3 text-xs text-slate-400 font-mono select-none">
              churchcore.app/join/
            </span>
            <input
              id="orgSlug"
              type="text"
              required
              value={orgSlug}
              onChange={handleSlugChange}
              placeholder="grace-community"
              className="flex-1 bg-transparent px-2 py-2.5 text-sm font-mono text-white focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Administrator Account */}
      <div className="space-y-3 pt-3 border-t border-slate-800">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Administrator Account
        </h3>

        <div>
          <label htmlFor="adminName" className="block text-sm font-medium mb-1 text-slate-200">
            Your Full Name
          </label>
          <input
            id="adminName"
            type="text"
            required
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            placeholder="Pastor John Doe"
            className="w-full border border-slate-700 bg-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>

        <div>
          <label htmlFor="adminEmail" className="block text-sm font-medium mb-1 text-slate-200">
            Admin Email Address
          </label>
          <input
            id="adminEmail"
            type="email"
            required
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="john@gracecommunity.org"
            className="w-full border border-slate-700 bg-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1 text-slate-200">
            Password (min. 8 characters)
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full border border-slate-700 bg-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>
      </div>

      {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
        <div className="pt-2">
          <Turnstile
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            onSuccess={setTurnstileToken}
            onError={() => setError('Bot check failed. Please refresh.')}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl py-3 px-4 text-sm transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white" />
            <span>Creating Your Workspace...</span>
          </>
        ) : (
          <span>Start 14-Day Free Trial</span>
        )}
      </button>

      <div className="text-center text-xs text-slate-400 pt-2">
        <span>Already have an account? </span>
        <a href="/login" className="font-semibold text-indigo-400 hover:text-indigo-300 underline">
          Sign In
        </a>
      </div>
    </form>
  )
}
