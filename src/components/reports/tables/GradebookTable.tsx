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
      <label htmlFor="gradebook-search" className="text-sm font-medium text-slate-300">
        Search students
      </label>
      <input
        id="gradebook-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="mt-2 w-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 rounded-lg sm:max-w-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder="Filter by student name"
      />

      <div className="mt-4 grid gap-3 sm:hidden">
        {rows.map((row) => (
          <article key={row.user_id} className="card-crisp p-4">
            <h3 className="font-semibold text-white">{row.student_name}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Submissions</dt>
                <dd className="text-slate-200">{row.total_submissions}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Average</dt>
                <dd className="text-slate-200">
                  {row.avg_grade === null ? 'Not graded' : `${row.avg_grade.toFixed(1)}%`}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Last Submission</dt>
                <dd className="text-slate-200">
                  {row.last_submission_at ? new Date(row.last_submission_at).toLocaleDateString() : 'None'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Letter</dt>
                <dd className="text-slate-200">{gradeLetter(row.avg_grade)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="mt-4 hidden overflow-x-auto card-crisp overflow-hidden sm:block">
        <table className="min-w-full text-sm" role="table">
          <caption className="sr-only">Gradebook for {courseTitle}</caption>
          <thead className="bg-slate-900/80 border-b border-slate-800">
            <tr className="text-left">
              <th scope="col" className="px-4 py-3 font-semibold text-slate-300">
                <button type="button" onClick={() => toggleSort('student_name')} className="hover:text-white transition-colors">
                  Student Name
                </button>
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-300">
                Total Submissions
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-300">
                <button type="button" onClick={() => toggleSort('avg_grade')} className="hover:text-white transition-colors">
                  Average Grade
                </button>
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-300">
                <button type="button" onClick={() => toggleSort('last_submission_at')} className="hover:text-white transition-colors">
                  Last Submission
                </button>
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-300">
                Grade Letter
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row) => (
              <tr key={row.user_id} className="hover:bg-slate-800/40 transition-colors">
                <th scope="row" className="px-4 py-3 text-left font-medium text-white">
                  {row.student_name}
                </th>
                <td className="px-4 py-3 text-slate-300">{row.total_submissions}</td>
                <td className="px-4 py-3 text-slate-300">
                  {row.avg_grade === null ? 'Not graded' : `${row.avg_grade.toFixed(1)}%`}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {row.last_submission_at ? new Date(row.last_submission_at).toLocaleDateString() : 'None'}
                </td>
                <td className="px-4 py-3 font-semibold text-amber-300">{gradeLetter(row.avg_grade)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
