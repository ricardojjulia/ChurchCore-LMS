import { Skeleton } from '@/components/ui/skeleton'

export default function GradebookLoading() {
  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Back link + page title */}
        <div className="mb-6">
          <Skeleton className="h-4 w-40 mb-2" />
          <Skeleton className="h-8 w-56" />
        </div>

        {/* Header bar with export button placeholder */}
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>

        {/* Grid skeleton */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="border-b border-border bg-slate-50/50 p-4">
            <div className="flex gap-4">
              <Skeleton className="h-5 w-36 shrink-0" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-28" />
              ))}
            </div>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3 items-center">
                <Skeleton className="h-4 w-36 shrink-0" />
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-8 w-20 rounded-lg" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
