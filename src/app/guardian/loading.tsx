import { Skeleton } from '@/components/ui/skeleton'

export default function GuardianLoading() {
  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Skeleton className="h-8 w-56 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-border rounded-xl p-5">
              <Skeleton className="h-5 w-2/3 mb-3" />
              <div className="flex gap-4">
                <Skeleton className="h-10 w-16" />
                <Skeleton className="h-10 w-16" />
                <Skeleton className="h-10 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
