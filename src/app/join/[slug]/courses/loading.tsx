import { Skeleton } from '@/components/ui/skeleton'

export default function PublicCourseCatalogLoading() {
  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 text-center">
          <Skeleton className="h-8 w-64 mx-auto mb-3 bg-slate-800" />
          <Skeleton className="h-4 w-40 mx-auto bg-slate-800" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
              <Skeleton className="h-5 w-2/3 mb-2 bg-slate-800" />
              <Skeleton className="h-4 w-full bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
