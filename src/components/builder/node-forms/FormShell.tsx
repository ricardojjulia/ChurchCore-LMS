'use client'

interface ShellProps {
  title: string
  icon: string
  onCancel: () => void
  onSubmit: (e: React.FormEvent) => void
  children: React.ReactNode
}

export function FormShell({ title, icon, onCancel, onSubmit, children }: ShellProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800 shrink-0">
        <span className="text-2xl">{icon}</span>
        <h3 className="text-white font-bold text-base">{title}</h3>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {children}
      </div>
      <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-800 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-500 transition-colors"
        >
          Save
        </button>
      </div>

      <style>{`
        .input { width:100%; background:#1e1e2e; border:1px solid #3f3f5a; color:#e5e7eb; border-radius:10px; padding:10px 14px; font-size:14px; outline:none; font-family:inherit; }
        .input:focus { border-color:#6366f1; }
        .label { display:block; font-size:12px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
        .hint { font-size:11px; color:#64748b; margin-top:4px; }
      `}</style>
    </form>
  )
}

interface FieldProps {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}

export function Field({ label, required, hint, children }: FieldProps) {
  return (
    <div>
      <label className="label">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

export function XpField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-indigo-950/40 border border-indigo-800/40 rounded-xl">
      <span className="text-xl">⭐</span>
      <div className="flex-1">
        <label className="label" style={{ marginBottom: 4 }}>XP Reward</label>
        <p className="hint" style={{ marginTop: 0 }}>Awarded when student completes this item.</p>
      </div>
      <input
        type="number"
        min={0}
        max={1000}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input"
        style={{ width: 80, textAlign: 'center' }}
      />
    </div>
  )
}

export function Toggle({ label, hint, value, onChange }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
      <div>
        <p className="text-sm font-semibold text-slate-300">{label}</p>
        {hint && <p className="hint" style={{ marginTop: 2 }}>{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-indigo-600' : 'bg-slate-600'}`}
      >
        <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}
