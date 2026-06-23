import { notFound }            from 'next/navigation'
import { createServiceClient } from '@/utils/supabase/service'
import { updateTenant }        from '../../../actions'

export default async function EditTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const service = createServiceClient()

  const { data: org } = await service
    .from('organizations')
    .select('id, name, slug, plan, settings')
    .eq('id', id)
    .single()

  if (!org) notFound()

  const features = org.settings?.features ?? {}
  const branding = org.settings?.branding ?? {}

  const action = updateTenant.bind(null, org.id)

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <a href="/platform" className="hover:text-slate-300">Tenants</a>
        <span className="text-slate-700">/</span>
        <a href={`/platform/tenants/${org.id}`} className="hover:text-slate-300">{org.name}</a>
        <span className="text-slate-700">/</span>
        <span className="text-slate-400">Edit</span>
      </div>

      <h1 className="mt-4 text-2xl font-bold text-white">Edit {org.name}</h1>

      <form action={action} className="mt-8 space-y-6">
        {/* Basics */}
        <Section title="Organization">
          <Field label="Name" name="name" defaultValue={org.name} required />
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Plan</label>
            <select name="plan" defaultValue={org.plan} className={selectCls}>
              <option value="free">Free / Trial</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </div>
        </Section>

        {/* Branding */}
        <Section title="Branding">
          <Field
            label="Logo URL"
            name="logo_url"
            defaultValue={branding.logo_url ?? ''}
            placeholder="https://cdn.example.com/logo.png"
          />
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Primary color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                name="primary_color"
                defaultValue={branding.primary_color ?? '#6366f1'}
                className="h-9 w-16 cursor-pointer rounded border border-slate-700 bg-slate-800 p-1"
              />
              <span className="text-xs text-slate-500">Used for buttons and accents</span>
            </div>
          </div>
          <Field
            label="Email from name"
            name="email_from_name"
            defaultValue={branding.email_from_name ?? ''}
            placeholder="Grace Church Learning"
          />
        </Section>

        {/* Feature flags */}
        <Section title="Features">
          <Toggle name="feat_ai_tutor"    label="AI Tutor"           checked={features.ai_tutor} />
          <Toggle name="feat_guardian"    label="Guardian Portal"    checked={features.guardian_portal} />
          <Toggle name="feat_leaderboard" label="Leaderboard"        checked={features.leaderboard} />
          <Toggle name="feat_hq"          label="HQ (AI Council)"   checked={features.hq} />
          <Toggle name="feat_reporting"   label="Reporting"          checked={features.reporting} />
        </Section>

        <div className="flex gap-3">
          <button type="submit" className="flex-1 rounded bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">
            Save Changes
          </button>
          <a
            href={`/platform/tenants/${org.id}`}
            className="rounded border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      {children}
    </div>
  )
}

function Field({
  label, name, defaultValue = '', type = 'text', required, placeholder,
}: {
  label: string; name: string; defaultValue?: string; type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-300 mb-1">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <input
        id={name} name={name} type={type} required={required}
        defaultValue={defaultValue} placeholder={placeholder}
        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
      />
    </div>
  )
}

function Toggle({ name, label, checked }: { name: string; label: string; checked?: boolean }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <input
        type="checkbox" name={name} value="on" defaultChecked={!!checked}
        className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
      />
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  )
}

const selectCls = 'w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none'
