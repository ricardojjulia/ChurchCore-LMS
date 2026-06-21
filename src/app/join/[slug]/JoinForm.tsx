'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Turnstile } from '@marsidev/react-turnstile'
import { createClient } from '@/utils/supabase/client'

interface Props {
  orgId:        string
  orgName:      string
  primaryColor?: string
}

export default function JoinForm({ orgId, orgName, primaryColor }: Props) {
  const router = useRouter()
  const [displayName, setDisplayName]   = useState('')
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [loading, setLoading]           = useState(false)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!turnstileToken) {
      setError('Please complete the security check.')
      return
    }

    setLoading(true)
    try {
      // Verify Turnstile and sign up in one server action call
      const { verifyAndEnroll } = await import('../actions')
      const result = await verifyAndEnroll({
        orgId,
        email,
        password,
        displayName,
        turnstileToken,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      // Sign in after successful account creation
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError('Account created — please sign in.')
        router.push('/login')
        return
      }

      router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  const btnStyle = primaryColor
    ? { backgroundColor: primaryColor }
    : undefined

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="displayName" className="block text-sm font-medium mb-1">
          Full name
        </label>
        <input
          id="displayName"
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Your name"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="At least 8 characters"
        />
      </div>

      <Turnstile
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''}
        onSuccess={setTurnstileToken}
        onError={() => setError('Security check failed. Please refresh and try again.')}
        className="mt-2"
      />

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !turnstileToken}
        style={btnStyle}
        className="w-full bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {loading ? 'Creating account…' : `Join ${orgName}`}
      </button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <a href="/login" className="underline">
          Sign in
        </a>
      </p>
    </form>
  )
}
