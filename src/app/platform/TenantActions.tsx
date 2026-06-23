'use client'

import { useTransition } from 'react'
import Link               from 'next/link'
import { suspendTenant, restoreTenant, softDeleteTenant } from './actions'

export default function TenantActions({
  orgId,
  orgName,
  status,
}: {
  orgId:    string
  orgName:  string
  status:   string
}) {
  const [pending, start] = useTransition()

  function handleSuspend() {
    if (!confirm(`Suspend "${orgName}"? All users will be locked out immediately.`)) return
    start(() => suspendTenant(orgId))
  }

  function handleRestore() {
    if (!confirm(`Restore "${orgName}"?`)) return
    start(() => restoreTenant(orgId))
  }

  function handleDelete() {
    const typed = window.prompt(
      `This will soft-delete "${orgName}" and lock out all users.\n\nType the organization name to confirm:`
    )
    if (typed === null) return
    if (typed.trim() !== orgName) {
      alert('Name did not match. Deletion cancelled.')
      return
    }
    start(() => softDeleteTenant(orgId))
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <Link
        href={`/platform/tenants/${orgId}/edit`}
        className="text-slate-400 hover:text-white transition-colors"
      >
        Edit
      </Link>
      {status === 'suspended' ? (
        <button
          onClick={handleRestore}
          disabled={pending}
          className="text-green-500 hover:text-green-300 disabled:opacity-40 transition-colors"
        >
          Restore
        </button>
      ) : status !== 'deleted' && (
        <button
          onClick={handleSuspend}
          disabled={pending}
          className="text-amber-500 hover:text-amber-300 disabled:opacity-40 transition-colors"
        >
          Suspend
        </button>
      )}
      {status !== 'deleted' && (
        <button
          onClick={handleDelete}
          disabled={pending}
          className="text-rose-600 hover:text-rose-400 disabled:opacity-40 transition-colors"
        >
          Delete
        </button>
      )}
    </span>
  )
}
