export default function StudentProgressSkeleton({ variant = 'full' }: { variant?: 'full' | 'chart' | 'table' }) {
  if (variant === 'chart') {
    return <div className="mt-3 h-80 animate-pulse bg-slate-100" />
  }

  if (variant === 'table') {
    return <div className="mt-3 h-64 animate-pulse bg-slate-100" />
  }

  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-80 bg-slate-100" />
      <div className="h-80 bg-slate-100" />
      <div className="h-64 bg-slate-100" />
    </div>
  )
}
