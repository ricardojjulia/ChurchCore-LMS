import { Skeleton } from '@/components/ui/skeleton'

export default function BlueprintsLoading() {
  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-9 w-36 rounded-xl" />
        </div>

        {/* Table — columns: Blueprint, Track, Credits, Status, Actions */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="bg-slate-50 border-b border-border px-6 py-3 flex items-center gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16 ml-auto" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-10" />
          </div>
          {/* Table rows */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-6 py-4 border-b border-border flex items-center gap-4">
              {/* Blueprint column */}
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-48 mb-1.5" />
                <Skeleton className="h-3 w-24 mb-1" />
                <Skeleton className="h-3 w-64" />
              </div>
              {/* Track badge */}
              <Skeleton className="h-5 w-16 rounded" />
              {/* Credits */}
              <Skeleton className="h-4 w-8" />
              {/* Status badge */}
              <Skeleton className="h-5 w-16 rounded-full" />
              {/* Action link */}
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
