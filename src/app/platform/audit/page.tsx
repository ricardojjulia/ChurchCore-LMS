import { createServiceClient } from '@/utils/supabase/service'

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const page    = Math.max(1, Number(searchParams.page ?? 1))
  const perPage = 50
  const from    = (page - 1) * perPage

  const service = createServiceClient()

  const { data: entries, count } = await service
    .from('platform_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + perPage - 1)

  const [{ data: orgs }, { data: admins }] = await Promise.all([
    service.from('organizations').select('id, name'),
    service.from('platform_admins').select('auth_id, display_name'),
  ])

  const orgNames: Record<string, string>   = {}
  const adminNames: Record<string, string> = {}
  for (const o of orgs   ?? []) orgNames[o.id]       = o.name
  for (const a of admins ?? []) adminNames[a.auth_id] = a.display_name

  const totalPages = Math.ceil((count ?? 0) / perPage)

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <span className="text-sm text-slate-500">{count ?? 0} entries</span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              {['Time', 'Actor', 'Action', 'Tenant', 'Payload'].map(h => (
                <th key={h} className="px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950">
            {(entries ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-600">
                  No audit entries yet.
                </td>
              </tr>
            )}
            {(entries ?? []).map(e => (
              <tr key={e.id} className="hover:bg-slate-900 transition-colors">
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {e.actor_id ? (adminNames[e.actor_id] ?? 'Unknown') : 'System'}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-indigo-400">{e.action}</span>
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {e.target_org ? orgNames[e.target_org] ?? e.target_org : '—'}
                </td>
                <td className="px-4 py-3 max-w-xs">
                  {e.payload ? (
                    <span className="block truncate font-mono text-xs text-slate-600">
                      {JSON.stringify(e.payload)}
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {page > 1 && (
            <a
              href={`/platform/audit?page=${page - 1}`}
              className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            >
              Previous
            </a>
          )}
          <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <a
              href={`/platform/audit?page=${page + 1}`}
              className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            >
              Next
            </a>
          )}
        </div>
      )}
    </>
  )
}
