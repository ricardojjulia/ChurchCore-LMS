export default function PerformanceLoading() {
  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto animate-pulse">
        <div className="h-8 w-56 bg-slate-200 rounded mb-2" />
        <div className="h-4 w-72 bg-slate-100 rounded mb-8" />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-border rounded-xl px-5 py-4 h-20" />
          ))}
        </div>

        <div className="bg-white border border-border rounded-xl overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-border flex items-center gap-4">
              <div className="h-4 w-48 bg-slate-100 rounded" />
              <div className="h-4 w-20 bg-slate-100 rounded" />
              <div className="h-2 w-24 bg-slate-100 rounded-full" />
              <div className="h-4 w-16 bg-slate-100 rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
