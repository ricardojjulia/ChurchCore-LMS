'use client'

interface Blueprint {
  id:    string
  title: string
}

interface Props {
  blueprints:       Blueprint[]
  value:            string | null
  onChange:         (id: string | null) => void
  disabled?:        boolean
}

export default function BlueprintSelector({ blueprints, value, onChange, disabled }: Props) {
  if (blueprints.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No course blueprints exist yet. Create one in the academic admin area first.
      </p>
    )
  }

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      title="Course blueprint"
      className="w-full border border-input rounded-md px-4 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring transition disabled:opacity-50"
    >
      <option value="">No blueprint (standalone course)</option>
      {blueprints.map((bp) => (
        <option key={bp.id} value={bp.id}>{bp.title}</option>
      ))}
    </select>
  )
}
