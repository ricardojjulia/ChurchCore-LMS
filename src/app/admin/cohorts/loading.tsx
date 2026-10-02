import { Skeleton } from '@/components/ui/skeleton'

export default function CohortsLoading() {
  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-5xl mx-auto">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-36 mb-2 bg-slate-800" />
            <Skeleton className="h-4 w-80 bg-slate-800" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl bg-slate-800" />
        </div>

        {/* Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="bg-slate-900/80 border-b border-slate-800 px-6 py-3 flex items-center gap-4">
            <Skeleton className="h-4 w-24 bg-slate-800" />
            <Skeleton className="h-4 w-20 ml-auto bg-slate-800" />
            <Skeleton className="h-4 w-16 bg-slate-800" />
            <Skeleton className="h-4 w-16 bg-slate-800" />
            <Skeleton className="h-4 w-10 bg-slate-800" />
          </div>
          {/* Table rows */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-6 py-4 border-b border-slate-800 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-40 mb-1.5 bg-slate-800" />
                <Skeleton className="h-3 w-24 bg-slate-800" />
              </div>
              <Skeleton className="h-5 w-16 rounded bg-slate-800" />
              <Skeleton className="h-4 w-8 text-center bg-slate-800" />
              <Skeleton className="h-5 w-16 rounded-full bg-slate-800" />
              <Skeleton className="h-4 w-20 bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
