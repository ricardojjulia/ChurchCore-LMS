import { Skeleton } from '@/components/ui/skeleton'

export default function UsersLoading() {
  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Skeleton className="h-9 w-56 mb-2 bg-slate-800" />
          <Skeleton className="h-4 w-72 bg-slate-800" />
        </div>
        {/* Stats bar */}
        <div className="flex flex-wrap gap-3 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-lg bg-slate-800" />
          ))}
        </div>
        {/* Search/filter bar */}
        <div className="flex gap-3 mb-4">
          <Skeleton className="h-10 flex-1 rounded-lg bg-slate-800" />
          <Skeleton className="h-10 w-32 rounded-lg bg-slate-800" />
        </div>
        {/* User rows */}
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 flex items-center gap-4">
              <Skeleton className="w-9 h-9 rounded-full shrink-0 bg-slate-800" />
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-40 mb-1.5 bg-slate-800" />
                <Skeleton className="h-3 w-56 bg-slate-800" />
              </div>
              <div className="flex gap-2 shrink-0">
                <Skeleton className="h-5 w-16 rounded-full bg-slate-800" />
                <Skeleton className="h-5 w-14 rounded-full bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
