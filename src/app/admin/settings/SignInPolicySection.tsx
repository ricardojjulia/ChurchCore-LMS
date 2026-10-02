'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateAuthPolicy } from '@/app/actions/org-settings'
import type { AuthPolicy } from '@/lib/auth-policy'

// Sign-in policy (COUNCIL-2026-037). Admin only; the action refuses settings
// that would sign the admin out.
export default function SignInPolicySection({
  orgId,
  policy,
  ssoAvailable,
}: {
  orgId: string
  policy: AuthPolicy
  ssoAvailable: boolean
}) {
  const router = useRouter()
  const [requireSso, setRequireSso] = useState(policy.require_sso_for_staff)
  const [disablePassword, setDisablePassword] = useState(policy.disable_password)
  const [domains, setDomains] = useState(policy.allowed_domains.join(', '))
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function save(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    startTransition(async () => {
      const res = await updateAuthPolicy(orgId, {
        require_sso_for_staff: requireSso, disable_password: disablePassword, allowed_domains: domains,
      })
      if (res.error) { setMessage({ kind: 'error', text: res.error }); return }
      setMessage({ kind: 'ok', text: 'Sign-in settings saved.' })
      router.refresh()
    })
  }

  return (
    <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4 shadow-sm">
      <h2 className="text-base font-semibold text-white">Sign-in</h2>
      {!ssoAvailable && (
        <p className="text-sm text-slate-300">
          Google and Microsoft sign-in aren&apos;t set up for this site yet, so only the email-domain rule is available.
        </p>
      )}
      <form onSubmit={save} className="space-y-4">
        <label className="flex items-start gap-3 text-sm text-slate-200">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-400" checked={requireSso} disabled={!ssoAvailable}
            onChange={(e) => setRequireSso(e.target.checked)} />
          <span><strong className="text-white">Require Google or Microsoft sign-in for staff</strong><br />
            <span className="text-slate-400">Admins, managers and teachers can&apos;t sign in with a password.</span></span>
        </label>
        <label className="flex items-start gap-3 text-sm text-slate-200">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-400" checked={disablePassword} disabled={!ssoAvailable}
            onChange={(e) => setDisablePassword(e.target.checked)} />
          <span><strong className="text-white">Turn off password sign-in for everyone</strong></span>
        </label>
        <div>
          <label htmlFor="allowed-domains" className="block text-sm font-semibold text-slate-200">Allowed email domains</label>
          <p id="allowed-domains-hint" className="text-xs text-slate-400">Leave empty to allow any address. Separate with commas, e.g. gracechurch.org</p>
          <input id="allowed-domains" aria-describedby="allowed-domains-hint" value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="e.g. gracechurch.org"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60 transition-colors">
            {pending ? 'Saving…' : 'Save sign-in settings'}
          </button>
          {message && (
            <p role={message.kind === 'error' ? 'alert' : 'status'}
              className={`text-sm ${message.kind === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>
              {message.text}
            </p>
          )}
        </div>
      </form>
    </section>
  )
}
