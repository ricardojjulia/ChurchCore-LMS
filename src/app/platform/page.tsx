import Link                from 'next/link'
import { createServiceClient } from '@/utils/supabase/service'
import TenantActions       from './TenantActions'

function healthScore(userCount: number, courseCount: number) {
  return Math.min(100, userCount * 5 + courseCount * 10)
}

function HealthBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold text-white ${color}`}>
      {score}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    trial:     'bg-sky-900 text-sky-300',
    active:    'bg-green-900 text-green-300',
    suspended: 'bg-amber-900 text-amber-300',
    deleted:   'bg-slate-800 text-slate-500',
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${styles[status] ?? styles.deleted}`}>
      {status}
    </span>
  )
}

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    free:     'bg-slate-700 text-slate-300',
    standard: 'bg-indigo-900 text-indigo-300',
    premium:  'bg-violet-900 text-violet-300',
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${styles[plan] ?? styles.free}`}>
      {plan}
    </span>
  )
}

export default async function PlatformPage() {
  const service = createServiceClient()

  const { data: orgs } = await service
    .from('organizations')
    .select('id, name, slug, status, plan, trial_ends_at, deleted_at, created_at, settings')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Aggregate user + course counts per org
  const { data: profileCounts } = await service
    .from('profiles')
    .select('org_id')

  const { data: courseCounts } = await service
    .from('courses')
    .select('org_id')

  const usersByOrg: Record<string, number> = {}
  const coursesByOrg: Record<string, number> = {}
  for (const p of profileCounts ?? []) if (p.org_id) usersByOrg[p.org_id] = (usersByOrg[p.org_id] ?? 0) + 1
  for (const c of courseCounts ?? []) if (c.org_id) coursesByOrg[c.org_id] = (coursesByOrg[c.org_id] ?? 0) + 1

  const tenants = (orgs ?? []).map(o => ({
    ...o,
    userCount:   usersByOrg[o.id]   ?? 0,
    courseCount: coursesByOrg[o.id] ?? 0,
    score:       healthScore(usersByOrg[o.id] ?? 0, coursesByOrg[o.id] ?? 0),
  }))

  const total     = tenants.length
  const active    = tenants.filter(t => t.status === 'active').length
  const trial     = tenants.filter(t => t.status === 'trial').length
  const expiring  = tenants.filter(t =>
    t.status === 'trial' && t.trial_ends_at &&
    new Date(t.trial_ends_at) < new Date(Date.now() + 30 * 86_400_000)
  ).length

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tenants</h1>
        <Link
          href="/platform/tenants/new"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          + New Tenant
        </Link>
      </div>

      {/* Stat bar */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total', value: total },
          { label: 'Active', value: active },
          { label: 'Trial', value: trial },
          { label: 'Expiring 30d', value: expiring },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="mt-0.5 text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Tenant table */}
      <div className="mt-8 overflow-x-auto rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              {['Tenant', 'Status', 'Plan', 'Users', 'Courses', 'Health', 'Trial ends', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950">
            {tenants.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-600">
                  No tenants yet. Create your first one.
                </td>
              </tr>
            )}
            {tenants.map(t => (
              <tr key={t.id} className="hover:bg-slate-900 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/platform/tenants/${t.id}`} className="font-medium text-white hover:text-indigo-400">
                    {t.name}
                  </Link>
                  <p className="text-xs text-slate-600">{t.slug}</p>
                </td>
                <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                <td className="px-4 py-3"><PlanBadge plan={t.plan} /></td>
                <td className="px-4 py-3 text-slate-300">{t.userCount}</td>
                <td className="px-4 py-3 text-slate-300">{t.courseCount}</td>
                <td className="px-4 py-3"><HealthBadge score={t.score} /></td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {t.trial_ends_at
                    ? new Date(t.trial_ends_at).toLocaleDateString()
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <TenantActions orgId={t.id} status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
