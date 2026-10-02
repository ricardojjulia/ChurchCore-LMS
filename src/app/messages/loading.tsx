import { Skeleton } from '@/components/ui/skeleton'

export default function MessagesLoading() {
  return (
    <main className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-32 bg-slate-800" />
          <Skeleton className="h-9 w-36 rounded-lg bg-slate-800" />
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-start gap-4">
              <Skeleton className="w-10 h-10 rounded-full shrink-0 bg-slate-800" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <Skeleton className="h-4 w-32 bg-slate-800" />
                  <Skeleton className="h-3 w-16 bg-slate-800" />
                </div>
                <Skeleton className="h-3 w-3/4 bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
