'use client'

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type GradePoint = {
  assignment: string
  grade: number | null
  submittedAt: string
}

export default function GradeHistoryChart({ data }: { data: GradePoint[] }) {
  const [showTable, setShowTable] = useState(false)
  const chartData = data.map((point) => ({ ...point, chartGrade: point.grade ?? 0 }))
  const summary = useMemo(() => {
    const graded = data.filter((point) => point.grade !== null)
    if (graded.length === 0) return 'No graded assignments available'
    const average = graded.reduce((sum, point) => sum + (point.grade ?? 0), 0) / graded.length
    return `${graded.length} graded items with an average grade of ${average.toFixed(1)} percent`
  }, [data])

  return (
    <div role="img" aria-label={`Grade history: ${summary}`}>
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
        <table className="w-full border-collapse text-sm" aria-label="Grade history data table">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th scope="col" className="py-2 pr-3 font-semibold text-slate-700">
                Assignment
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold text-slate-700">
                Grade
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold text-slate-700">
                Submitted
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={`${point.assignment}-${point.submittedAt}`} className="border-b border-slate-100">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-950">
                  {point.assignment}
                </th>
                <td className="py-2 pr-3 text-slate-700">
                  {point.grade === null ? 'Not graded' : `${point.grade}%`}
                </td>
                <td className="py-2 pr-3 text-slate-700">
                  {new Date(point.submittedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="assignment" />
              <YAxis domain={[0, 100]} />
              <Tooltip
                formatter={(value, _name, item) => {
                  const payload = item.payload as GradePoint
                  return [
                    payload.grade === null ? 'Not graded' : `${value}%`,
                    `${payload.assignment} (${new Date(payload.submittedAt).toLocaleDateString()})`,
                  ]
                }}
              />
              <Bar dataKey="chartGrade">
                {chartData.map((point) => (
                  <Cell key={`${point.assignment}-${point.submittedAt}`} fill={point.grade === null ? '#94A3B8' : '#134074'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
