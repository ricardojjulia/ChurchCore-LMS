import { Skeleton } from '@/components/ui/skeleton'

export default function TermsLoading() {
  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-44 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>

        {/* Tree-style list — top-level rows + indented child rows */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Top-level term */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              {/* Parent row */}
              <div className="flex items-center gap-3 px-6 py-3.5 border-b border-border">
                <div className="flex-1 min-w-0">
                  <Skeleton className="h-4 w-48 mb-1.5" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="h-4 w-36 hidden sm:block" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-10" />
              </div>
              {/* Child rows (indented) */}
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 pl-12 pr-6 py-3.5 border-b border-border">
                  <Skeleton className="h-3 w-3 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Skeleton className="h-4 w-36 mb-1.5" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded" />
                  <Skeleton className="h-4 w-36 hidden sm:block" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-10" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
