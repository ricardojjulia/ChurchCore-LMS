'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { GradebookSummary } from '@/types/reporting'

type Bucket = {
  letter: 'A' | 'B' | 'C' | 'D' | 'F'
  count: number
}

function bucketForGrade(grade: number): Bucket['letter'] {
  if (grade >= 90) return 'A'
  if (grade >= 80) return 'B'
  if (grade >= 70) return 'C'
  if (grade >= 60) return 'D'
  return 'F'
}

export default function GradeDistributionChart({ data }: { data: GradebookSummary[] }) {
  const [showTable, setShowTable] = useState(false)
  const buckets = useMemo<Bucket[]>(() => {
    const counts: Record<Bucket['letter'], number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    for (const row of data) {
      if (row.avg_grade === null) continue
      counts[bucketForGrade(row.avg_grade)] += 1
    }
    return Object.entries(counts).map(([letter, count]) => ({ letter: letter as Bucket['letter'], count }))
  }, [data])

  const summary = buckets.map((bucket) => `${bucket.count} ${bucket.letter}`).join(', ')

  return (
    <div role="img" aria-label={`Grade distribution: ${summary}`}>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          className="text-sm font-semibold text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
        >
          {showTable ? 'View as chart' : 'View as table'}
        </button>
      </div>

      {showTable ? (
        <table className="w-full border-collapse text-sm" aria-label="Grade distribution data table">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th scope="col" className="py-2 pr-3 font-semibold text-slate-700">
                Grade
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold text-slate-700">
                Students
              </th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.letter} className="border-b border-slate-100">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-950">
                  {bucket.letter}
                </th>
                <td className="py-2 pr-3 text-slate-700">{bucket.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="letter" />
              <YAxis allowDecimals={false} />
              <Tooltip formatter={(value) => [value, 'Students']} />
              <Bar dataKey="count" fill="#134074" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
