import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { updateOrgBranding } from '@/app/actions/org-settings'

export const dynamic = 'force-dynamic'

export default async function OrgSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, org_id, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile?.org_id || !['admin', 'manager'].includes(profile.role ?? '')) {
    notFound()
  }

  const service = createServiceClient()
  const { data: org } = await service
    .from('organizations')
    .select('id, name, slug, status, plan, settings')
    .eq('id', profile.org_id)
    .single()

  if (!org) notFound()

  const branding = (org.settings?.branding ?? {}) as Record<string, string>
  const features = (org.settings?.features ?? {}) as Record<string, boolean>

  const action = updateOrgBranding.bind(null, org.id)

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Page header */}
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Organization Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {org.name} · <span className="font-mono">{org.slug}</span>
          </p>
        </div>

        {/* Account (read-only) */}
        <section className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="text-base font-semibold text-foreground">Account</h2>
          <div className="divide-y divide-slate-100">
            <Row label="Organization name" value={org.name} />
            <Row label="Slug" value={org.slug} mono />
            <Row label="Plan" value={org.plan} capitalize />
            <Row label="Status" value={org.status} capitalize />
            <Row label="Organization ID" value={org.id} mono small />
          </div>
        </section>

        {/* Branding (editable) */}
        <form action={action}>
          <section className="bg-white rounded-xl border p-6 space-y-5">
            <h2 className="text-base font-semibold text-foreground">Branding</h2>

            <div className="space-y-1">
              <label htmlFor="logo_url" className="block text-sm font-medium text-slate-700">
                Logo URL
              </label>
              <input
                id="logo_url"
                name="logo_url"
                type="text"
                defaultValue={branding.logo_url ?? ''}
                placeholder="https://cdn.example.com/logo.png"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Primary color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="primary_color"
                  name="primary_color"
                  aria-label="Primary brand color"
                  defaultValue={branding.primary_color ?? '#6366f1'}
                  className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200 p-1"
                />
                <span className="text-xs text-muted-foreground">Used for buttons and accents across the app</span>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="email_from_name" className="block text-sm font-medium text-slate-700">
                Email from name
              </label>
              <input
                id="email_from_name"
                name="email_from_name"
                type="text"
                defaultValue={branding.email_from_name ?? ''}
                placeholder="Grace Church Learning"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors"
              >
                Save Branding
              </button>
            </div>
          </section>
        </form>

        {/* Feature flags (read-only) */}
        {Object.keys(features).length > 0 && (
          <section className="bg-white rounded-xl border p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Features</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Managed by your platform administrator. Contact support to request changes.
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {Object.entries(features).map(([key, enabled]) => (
                <div key={key} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-slate-700 capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    enabled
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </main>
  )
}

function Row({
  label, value, mono, capitalize, small,
}: {
  label: string
  value: string
  mono?: boolean
  capitalize?: boolean
  small?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className={[
        'text-sm font-medium text-slate-900 text-right truncate',
        mono ? 'font-mono text-xs text-slate-500' : '',
        capitalize ? 'capitalize' : '',
        small ? 'text-xs' : '',
      ].filter(Boolean).join(' ')}>
        {value}
      </span>
    </div>
  )
}
