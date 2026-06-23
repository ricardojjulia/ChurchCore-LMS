import Link                   from 'next/link'
import { notFound }            from 'next/navigation'
import { createServiceClient } from '@/utils/supabase/service'
import TenantActions           from '../../TenantActions'
import ResetActions            from './ResetActions'

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const service = createServiceClient()

  const { data: org } = await service
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single()

  if (!org) notFound()

  const [{ data: users }, { data: courses }, { data: auditEntries }] = await Promise.all([
    service.from('profiles').select('uid, full_name, email, role: profile_roles(role)').eq('org_id', org.id).limit(50),
    service.from('courses').select('id, title, status, created_at').eq('org_id', org.id).order('created_at', { ascending: false }).limit(20),
    service.from('platform_audit_log').select('*').eq('target_org', org.id).order('created_at', { ascending: false }).limit(20),
  ])

  const features = org.settings?.features ?? {}
  const branding = org.settings?.branding ?? {}

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/platform" className="text-sm text-slate-500 hover:text-slate-300">Tenants</Link>
            <span className="text-slate-700">/</span>
            <span className="text-sm text-slate-300">{org.name}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white">{org.name}</h1>
          <p className="text-xs text-slate-600 mt-0.5">{org.slug} · {org.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/platform/tenants/${org.id}/edit`}
            className="rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600 transition-colors"
          >
            Edit Settings
          </Link>
          <TenantActions orgId={org.id} orgName={org.name} status={org.status} />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Status', value: org.status },
          { label: 'Plan', value: org.plan },
          { label: 'Users', value: users?.length ?? 0 },
          { label: 'Courses', value: courses?.length ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-white capitalize">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Features */}
        <Section title="Feature Flags">
          <div className="space-y-2">
            {Object.entries(features).map(([key, enabled]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-slate-400 capitalize">{key.replace(/_/g, ' ')}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${enabled ? 'bg-green-900 text-green-300' : 'bg-slate-800 text-slate-500'}`}>
                  {enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* Branding */}
        <Section title="Branding">
          {Object.keys(branding).length === 0 ? (
            <p className="text-sm text-slate-600">No branding configured.</p>
          ) : (
            <div className="space-y-2">
              {branding.primary_color && (
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 rounded" style={{ backgroundColor: branding.primary_color }} />
                  <span className="text-sm text-slate-400">{branding.primary_color}</span>
                </div>
              )}
              {branding.logo_url && (
                <p className="text-xs text-slate-500 break-all">{branding.logo_url}</p>
              )}
              {branding.email_from_name && (
                <p className="text-sm text-slate-400">From: {branding.email_from_name}</p>
              )}
            </div>
          )}
        </Section>

        {/* Users */}
        <Section title={`Users (${users?.length ?? 0})`}>
          <div className="divide-y divide-slate-800 -mx-4">
            {(users ?? []).slice(0, 10).map(u => (
              <div key={u.uid} className="flex items-center justify-between px-4 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-200">{u.full_name || '—'}</p>
                  <p className="text-xs text-slate-600">{u.email}</p>
                </div>
                <span className="text-xs text-slate-500 capitalize">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested join returns role as array; shape not narrowed */}
                  {(u.role as any)?.[0]?.role ?? '—'}
                </span>
              </div>
            ))}
            {(users?.length ?? 0) > 10 && (
              <p className="px-4 py-2 text-xs text-slate-600">+{(users?.length ?? 0) - 10} more</p>
            )}
          </div>
        </Section>

        {/* Recent Courses */}
        <Section title={`Courses (${courses?.length ?? 0})`}>
          <div className="divide-y divide-slate-800 -mx-4">
            {(courses ?? []).map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2">
                <p className="text-sm text-slate-300">{c.title}</p>
                <span className={`text-xs ${c.status === 'published' ? 'text-green-500' : 'text-slate-600'}`}>
                  {c.status}
                </span>
              </div>
            ))}
            {(courses?.length ?? 0) === 0 && (
              <p className="px-4 py-2 text-xs text-slate-600">No courses yet.</p>
            )}
          </div>
        </Section>
      </div>

      {/* Danger Zone — Reset */}
      <Section title="Danger Zone" className="mt-8 border-rose-900/50 bg-rose-950/20">
        <p className="text-sm text-slate-400 mb-4">
          Reset this tenant&apos;s content. User accounts are always preserved.
        </p>
        <ResetActions orgId={org.id} orgName={org.name} />
      </Section>

      {/* Audit log */}
      <Section title="Audit Log" className="mt-8">
        <div className="divide-y divide-slate-800 -mx-4">
          {(auditEntries ?? []).map(e => (
            <div key={e.id} className="flex items-center justify-between gap-4 px-4 py-2">
              <span className="text-xs font-mono text-indigo-400">{e.action}</span>
              <span className="text-xs text-slate-500 shrink-0">
                {new Date(e.created_at).toLocaleString()}
              </span>
            </div>
          ))}
          {(auditEntries?.length ?? 0) === 0 && (
            <p className="px-4 py-2 text-xs text-slate-600">No audit entries.</p>
          )}
        </div>
      </Section>
    </>
  )
}

function Section({ title, children, className }: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-900 p-4 ${className ?? ''}`}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      {children}
    </div>
  )
}
