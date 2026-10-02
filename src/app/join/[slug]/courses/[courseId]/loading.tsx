import { Skeleton } from '@/components/ui/skeleton'

export default function PublicCourseDetailLoading() {
  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-3xl mx-auto">
        <Skeleton className="h-4 w-32 mb-6 bg-slate-800" />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 mb-8 shadow-sm">
          <Skeleton className="h-7 w-2/3 mb-3 bg-slate-800" />
          <Skeleton className="h-4 w-full mb-1 bg-slate-800" />
          <Skeleton className="h-4 w-3/4 mb-6 bg-slate-800" />
          <Skeleton className="h-11 w-32 rounded-xl bg-slate-800" />
        </div>

        <Skeleton className="h-5 w-28 mb-4 bg-slate-800" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-slate-900/80 border-b border-slate-800 px-6 py-4">
                <Skeleton className="h-4 w-40 bg-slate-800" />
              </div>
              <div className="px-6 py-3.5 space-y-2">
                <Skeleton className="h-4 w-full bg-slate-800" />
                <Skeleton className="h-4 w-2/3 bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
