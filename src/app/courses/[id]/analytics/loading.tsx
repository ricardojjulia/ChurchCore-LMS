import { Skeleton } from '@/components/ui/skeleton'

export default function CourseAnalyticsLoading() {
  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Back link + page title */}
        <div className="mb-6">
          <Skeleton className="h-4 w-40 mb-2" />
          <Skeleton className="h-8 w-56" />
        </div>

        {/* 5 summary stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-border rounded-xl px-4 py-3">
              <Skeleton className="h-7 w-12 mb-1.5" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>

        {/* Section label + export button row */}
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>

        {/* Student results table */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="border-b border-border bg-muted/20 px-5 py-3 flex items-center gap-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-8 ml-auto" />
          </div>
          {/* Table rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-5 py-3 border-b border-border flex items-center gap-4">
              {/* Student column */}
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-36 mb-1" />
                <Skeleton className="h-3 w-48" />
              </div>
              {/* Status badge */}
              <Skeleton className="h-5 w-20 rounded-full" />
              {/* Progress bar */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-1.5 w-16 rounded-full" />
                <Skeleton className="h-3 w-8" />
              </div>
              {/* Grade bar */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-1.5 w-20 rounded-full" />
                <Skeleton className="h-3 w-10" />
              </div>
              {/* GPA */}
              <Skeleton className="h-4 w-8" />
              {/* Submissions */}
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
