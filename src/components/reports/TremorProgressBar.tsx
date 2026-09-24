// Native progress bar (replaces @tremor/react, which does not support React 19
// and was used only here). The file name is kept so callers are unchanged.
export default function TremorProgressBar({
  value,
  className,
  label,
}: {
  value: number
  className?: string
  label: string
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`h-2 w-full overflow-hidden rounded-full bg-slate-200 ${className ?? ''}`}
    >
      <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}
