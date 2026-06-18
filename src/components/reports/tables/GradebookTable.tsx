'use client'

import { useMemo, useState } from 'react'

import type { GradebookSummary } from '@/types/reporting'

type SortKey = 'student_name' | 'avg_grade' | 'last_submission_at'
type SortDirection = 'asc' | 'desc'

function gradeLetter(grade: number | null): string {
  if (grade === null) return 'Not graded'
  if (grade >= 90) return 'A'
  if (grade >= 80) return 'B'
  if (grade >= 70) return 'C'
  if (grade >= 60) return 'D'
  return 'F'
}

function sortValue(row: GradebookSummary, key: SortKey): string | number {
  if (key === 'student_name') return row.student_name.toLowerCase()
  if (key === 'avg_grade') return row.avg_grade ?? -1
  return row.last_submission_at ? new Date(row.last_submission_at).getTime() : 0
}

export default function GradebookTable({
  data,
  courseTitle,
}: {
  data: GradebookSummary[]
  courseTitle: string
}) {
  const [sortKey, setSortKey] = useState<SortKey>('student_name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const filtered = data.filter((row) =>
      row.student_name.toLowerCase().includes(search.trim().toLowerCase())
    )

    return filtered.sort((a, b) => {
      const aValue = sortValue(a, sortKey)
      const bValue = sortValue(b, sortKey)
      const comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0
      return sortDirection === 'asc' ? comparison : comparison * -1
    })
  }, [data, search, sortDirection, sortKey])

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(nextKey)
      setSortDirection('asc')
    }
  }

  return (
    <div>
      <label htmlFor="gradebook-search" className="text-sm font-medium text-slate-700">
        Search students
      </label>
      <input
        id="gradebook-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="mt-2 w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 sm:max-w-sm"
        placeholder="Filter by student name"
      />

      <div className="mt-4 grid gap-3 sm:hidden">
        {rows.map((row) => (
          <article key={row.user_id} className="border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-slate-950">{row.student_name}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Submissions</dt>
                <dd className="text-slate-800">{row.total_submissions}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Average</dt>
                <dd className="text-slate-800">
                  {row.avg_grade === null ? 'Not graded' : `${row.avg_grade.toFixed(1)}%`}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Last Submission</dt>
                <dd className="text-slate-800">
                  {row.last_submission_at ? new Date(row.last_submission_at).toLocaleDateString() : 'None'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Letter</dt>
                <dd className="text-slate-800">{gradeLetter(row.avg_grade)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="mt-4 hidden overflow-x-auto border border-slate-200 bg-white shadow-sm sm:block">
        <table className="min-w-full text-sm" role="table">
          <caption className="sr-only">Gradebook for {courseTitle}</caption>
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                <button type="button" onClick={() => toggleSort('student_name')}>
                  Student Name
                </button>
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                Total Submissions
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                <button type="button" onClick={() => toggleSort('avg_grade')}>
                  Average Grade
                </button>
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                <button type="button" onClick={() => toggleSort('last_submission_at')}>
                  Last Submission
                </button>
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                Grade Letter
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.user_id}>
                <th scope="row" className="px-4 py-3 text-left font-medium text-slate-950">
                  {row.student_name}
                </th>
                <td className="px-4 py-3 text-slate-700">{row.total_submissions}</td>
                <td className="px-4 py-3 text-slate-700">
                  {row.avg_grade === null ? 'Not graded' : `${row.avg_grade.toFixed(1)}%`}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {row.last_submission_at ? new Date(row.last_submission_at).toLocaleDateString() : 'None'}
                </td>
                <td className="px-4 py-3 text-slate-700">{gradeLetter(row.avg_grade)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
