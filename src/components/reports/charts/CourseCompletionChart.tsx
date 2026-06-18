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

import type { CourseCompletionRate } from '@/types/reporting'

function completionColor(rate: number): string {
  if (rate > 70) return '#16A34A'
  if (rate >= 40) return '#D97706'
  return '#DC2626'
}

export default function CourseCompletionChart({ data }: { data: CourseCompletionRate[] }) {
  const [showTable, setShowTable] = useState(false)
  const summary = useMemo(() => {
    if (data.length === 0) return 'No course completion data available'
    const average = data.reduce((sum, course) => sum + course.completion_rate_pct, 0) / data.length
    return `${data.length} courses with average completion of ${average.toFixed(1)} percent`
  }, [data])

  return (
    <div role="img" aria-label={`Course completion rates: ${summary}`}>
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
        <table className="w-full border-collapse text-sm" aria-label="Course completion data table">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th scope="col" className="py-2 pr-3 font-semibold text-slate-700">
                Course
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold text-slate-700">
                Completion
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold text-slate-700">
                Completed / Enrolled
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((course) => (
              <tr key={course.course_id} className="border-b border-slate-100">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-950">
                  {course.course_title}
                </th>
                <td className="py-2 pr-3 text-slate-700">{course.completion_rate_pct}%</td>
                <td className="py-2 pr-3 text-slate-700">
                  {course.completed_count} / {course.enrolled_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="course_title" />
              <YAxis domain={[0, 100]} />
              <Tooltip formatter={(value) => [`${value}%`, 'Completion']} />
              <Bar dataKey="completion_rate_pct">
                {data.map((course) => (
                  <Cell key={course.course_id} fill={completionColor(course.completion_rate_pct)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
