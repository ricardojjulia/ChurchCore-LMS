import { Skeleton } from '@/components/ui/skeleton'

export default function ProfileLoading() {
  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Banner skeleton */}
          <div className="bg-gradient-to-r from-indigo-950 to-slate-900 px-8 py-6 flex items-center gap-5">
            <Skeleton className="w-16 h-16 rounded-full bg-indigo-800/50" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40 bg-indigo-800/50" />
              <Skeleton className="h-4 w-28 bg-indigo-800/50" />
            </div>
          </div>
          {/* Form skeleton */}
          <div className="px-8 py-8 space-y-6">
            <div>
              <Skeleton className="h-4 w-28 mb-2" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div>
              <Skeleton className="h-4 w-16 mb-2" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="flex justify-between pt-2">
              <Skeleton className="h-9 w-20 rounded-md" />
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
