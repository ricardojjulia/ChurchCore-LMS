'use client'

import { useTransition } from 'react'
import Link               from 'next/link'
import { suspendTenant, restoreTenant, softDeleteTenant } from './actions'

export default function TenantActions({
  orgId,
  status,
}: {
  orgId: string
  status: string
}) {
  const [pending, start] = useTransition()

  function handleSuspend() {
    if (!confirm('Suspend this tenant? All users will be locked out immediately.')) return
    start(() => suspendTenant(orgId))
  }

  function handleRestore() {
    start(() => restoreTenant(orgId))
  }

  function handleDelete() {
    if (!confirm('Soft-delete this tenant? It will be permanently purged after 30 days.')) return
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
