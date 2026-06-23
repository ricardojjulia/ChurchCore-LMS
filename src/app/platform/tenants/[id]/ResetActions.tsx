'use client'

import { useTransition } from 'react'
import { resetTenantToEmpty, resetTenantToDemo } from '../../actions'

export default function ResetActions({
  orgId,
  orgName,
}: {
  orgId:   string
  orgName: string
}) {
  const [pending, start] = useTransition()

  function handleEmpty() {
    const typed = window.prompt(
      `This will DELETE all courses, cohorts, announcements, and learning data for "${orgName}".\nUser accounts will be preserved.\n\nType the organization name to confirm:`
    )
    if (typed === null) return
    if (typed.trim() !== orgName) {
      alert('Name did not match. Reset cancelled.')
      return
    }
    start(() => resetTenantToEmpty(orgId))
  }

  function handleDemo() {
    const typed = window.prompt(
      `This will WIPE all content for "${orgName}" and replace it with demo data.\nUser accounts will be preserved.\n\nType the organization name to confirm:`
    )
    if (typed === null) return
    if (typed.trim() !== orgName) {
      alert('Name did not match. Reset cancelled.')
      return
    }
    start(() => resetTenantToDemo(orgId))
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Both options preserve user accounts. Content deletions are permanent.
      </p>
      <div className="flex gap-3">
        <button
          onClick={handleDemo}
          disabled={pending}
          className="rounded border border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-900/30 disabled:opacity-40 transition-colors"
        >
          {pending ? 'Resetting…' : 'Reset to Demo'}
        </button>
        <button
          onClick={handleEmpty}
          disabled={pending}
          className="rounded border border-rose-800 px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-900/30 disabled:opacity-40 transition-colors"
        >
          {pending ? 'Resetting…' : 'Reset to Empty'}
        </button>
      </div>
    </div>
  )
}
