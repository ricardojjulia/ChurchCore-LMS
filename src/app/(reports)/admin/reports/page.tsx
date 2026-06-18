// SCAFFOLD — Implementation added in PROMPT-013 (admin)

import { Suspense } from 'react'

function ReportsSkeleton() {
  return <div className="h-48 animate-pulse bg-slate-100" aria-label="Loading admin reports" />
}

export default async function AdminReportsPage() {
  return (
    <main className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-slate-950">Admin Reporting Overview</h1>
      <Suspense fallback={<ReportsSkeleton />}>
        <div className="mt-6 border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
          {/* TODO: PROMPT-009 implements charts */}
        </div>
      </Suspense>
    </main>
  )
}
