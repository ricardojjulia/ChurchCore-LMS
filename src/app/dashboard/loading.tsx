import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Smart Summary Card skeleton */}
        <div className="bg-white border border-border rounded-2xl px-6 py-5 mb-6 shadow-sm">
          <Skeleton className="h-7 w-64 mb-2" />
          <Skeleton className="h-4 w-80 mb-3" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>

        {/* Section header */}
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>

        {/* Course card skeletons */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-border rounded-xl overflow-hidden flex flex-col">
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-16 shrink-0" />
                </div>
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-2/3 mb-4" />
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              </div>
              <div className="border-t border-border px-5 py-3 bg-muted/20">
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
