export default function LearningPathsLoading() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="h-8 w-48 bg-muted animate-pulse rounded mb-2" />
      <div className="h-4 w-72 bg-muted animate-pulse rounded mb-6" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-muted/30 h-44 animate-pulse" />
        ))}
      </div>
    </main>
  )
}
