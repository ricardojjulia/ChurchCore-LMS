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
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Organization Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">{org.name} · {org.slug}</p>
      </div>

      {/* Account info (read-only) */}
      <Section title="Account">
        <InfoRow label="Organization name" value={org.name} />
        <InfoRow label="Slug" value={org.slug} mono />
        <InfoRow label="Plan" value={org.plan} capitalize />
        <InfoRow label="Status" value={org.status} capitalize />
        <InfoRow label="Organization ID" value={org.id} mono small />
      </Section>

      {/* Branding (editable) */}
      <form action={action} className="space-y-6">
        <Section title="Branding">
          <Field
            label="Logo URL"
            name="logo_url"
            defaultValue={branding.logo_url ?? ''}
            placeholder="https://cdn.example.com/logo.png"
          />
          <div>
            <label className="block text-sm font-medium mb-1">Primary color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                name="primary_color"
                defaultValue={branding.primary_color ?? '#6366f1'}
                className="h-9 w-16 cursor-pointer rounded border p-1"
              />
              <span className="text-xs text-muted-foreground">Used for buttons and accents</span>
            </div>
          </div>
          <Field
            label="Email from name"
            name="email_from_name"
            defaultValue={branding.email_from_name ?? ''}
            placeholder="Grace Church Learning"
          />
        </Section>

        <button
          type="submit"
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Save Branding
        </button>
      </form>

      {/* Feature flags (read-only — platform admin controls these) */}
      {Object.keys(features).length > 0 && (
        <Section title="Features">
          <p className="text-xs text-muted-foreground mb-3">Managed by platform. Contact support to change.</p>
          <div className="space-y-2">
            {Object.entries(features).map(([key, enabled]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm capitalize">{key.replace(/_/g, ' ')}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                  enabled
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500'
                }`}>
                  {enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-6 space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </div>
  )
}

function InfoRow({
  label, value, mono, capitalize, small,
}: {
  label: string
  value: string
  mono?: boolean
  capitalize?: boolean
  small?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className={`text-sm font-medium text-right truncate ${mono ? 'font-mono text-xs' : ''} ${capitalize ? 'capitalize' : ''} ${small ? 'text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function Field({
  label, name, defaultValue = '', placeholder,
}: {
  label: string
  name: string
  defaultValue?: string
  placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium mb-1">{label}</label>
      <input
        id={name}
        name={name}
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    </div>
  )
}
