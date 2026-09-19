import { Skeleton } from '@/components/ui/skeleton'

export default function PlatformLoading() {
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <Skeleton className="mb-2 h-3 w-16" />
            <Skeleton className="h-6 w-10" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-slate-800">
        <div className="border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div className="grid grid-cols-8 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-full" />
            ))}
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, row) => (
          <div key={row} className="border-b border-slate-800 px-4 py-4 last:border-b-0">
            <div className="grid grid-cols-8 gap-4">
              {Array.from({ length: 8 }).map((_, col) => (
                <Skeleton key={col} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
