import { Skeleton } from '@/components/ui/skeleton'

export default function BillingLoading() {
  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-3xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <Skeleton className="h-9 w-28 mb-2 bg-slate-800" />
          <Skeleton className="h-4 w-72 bg-slate-800" />
        </div>

        {/* Current plan card */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4 mb-6">
          <Skeleton className="h-5 w-32 bg-slate-800" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-24 bg-slate-800" />
            <Skeleton className="h-5 w-16 rounded-full bg-slate-800" />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full shrink-0 bg-slate-800" />
                <Skeleton className="h-4 w-28 bg-slate-800" />
              </div>
            ))}
          </div>
        </div>

        {/* CTA card */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-3">
          <Skeleton className="h-5 w-44 bg-slate-800" />
          <Skeleton className="h-4 w-full bg-slate-800" />
          <Skeleton className="h-4 w-3/4 bg-slate-800" />
          <Skeleton className="h-10 w-56 rounded-xl bg-slate-800" />
        </div>
      </div>
    </main>
  )
}
