import { createTenant } from '../../actions'

export default function NewTenantPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-white">New Tenant</h1>
      <p className="mt-1 text-sm text-slate-500">
        Create a new organization. An invite will be sent to the admin email if provided.
      </p>

      <form action={createTenant} className="mt-8 space-y-6">
        {/* Basics */}
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Organization</h2>

          <Field label="Name" name="name" required placeholder="Grace Church" />
          <Field label="Slug" name="slug" required placeholder="grace-church"
            hint="URL-safe identifier, e.g. grace-church" />

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Plan</label>
            <select name="plan" className={selectCls}>
              <option value="free">Free / Trial</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </div>

          <Field label="Trial days" name="trial_days" type="number" placeholder="14"
            hint="Ignored if plan is Standard or Premium" />
        </section>

        {/* Admin invite */}
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Admin Invite (optional)</h2>
          <Field label="Admin email" name="admin_email" type="email" placeholder="pastor@grace.org" />
        </section>

        {/* Feature flags */}
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Features</h2>
          <Toggle name="feat_ai_tutor"    label="AI Tutor" defaultChecked />
          <Toggle name="feat_guardian"    label="Guardian Portal" defaultChecked />
          <Toggle name="feat_leaderboard" label="Leaderboard" defaultChecked />
          <Toggle name="feat_hq"          label="HQ (AI Council)" defaultChecked />
          <Toggle name="feat_reporting"   label="Reporting" defaultChecked />
        </section>

        <button type="submit" className="w-full rounded bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">
          Create Tenant
        </button>
      </form>
    </div>
  )
}

function Field({
  label,
  name,
  type = 'text',
  required,
  placeholder,
  hint,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  placeholder?: string
  hint?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-300 mb-1">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
      />
      {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
    </div>
  )
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        name={name}
        value="on"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
      />
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  )
}

const selectCls = 'w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none'
