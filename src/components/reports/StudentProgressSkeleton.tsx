export default function StudentProgressSkeleton({ variant = 'full' }: { variant?: 'full' | 'chart' | 'table' }) {
  if (variant === 'chart') {
    return <div className="mt-3 h-80 animate-pulse card-crisp bg-slate-900/60" />
  }

  if (variant === 'table') {
    return <div className="mt-3 h-64 animate-pulse card-crisp bg-slate-900/60" />
  }

  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-80 card-crisp bg-slate-900/60" />
      <div className="h-80 card-crisp bg-slate-900/60" />
      <div className="h-64 card-crisp bg-slate-900/60" />
    </div>
  )
}
