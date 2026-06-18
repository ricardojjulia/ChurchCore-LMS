import Link from 'next/link'

import type { StudentReportData } from '@/types/reporting'

type CourseRow = StudentReportData['courses'][number]

export default function EnrollmentTable({ courses }: { courses: CourseRow[] }) {
  if (courses.length === 0) {
    return (
      <div className="border border-slate-200 bg-white p-6 text-sm text-slate-600">
        No enrollments found
      </div>
    )
  }

  return (
    <div>
      <div className="grid gap-3 sm:hidden">
        {courses.map((course) => (
          <article key={course.courseId} className="border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-slate-950">{course.courseTitle}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Enrolled Date</dt>
                <dd className="text-slate-800">Not available</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Status</dt>
                <dd className="text-slate-800">{course.enrollmentStatus}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Average Grade</dt>
                <dd className="text-slate-800">
                  {course.averageGrade === null ? 'Not graded' : `${course.averageGrade}%`}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Certificate</dt>
                <dd className="text-slate-800">{course.certificateNo ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto border border-slate-200 bg-white shadow-sm sm:block">
        <table className="min-w-full text-sm" role="table">
          <caption className="sr-only">Student course enrollment report</caption>
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                Course Name
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                Enrolled Date
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                Completion Status
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                Average Grade
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                Certificate
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {courses.map((course) => (
              <tr key={course.courseId}>
                <th scope="row" className="px-4 py-3 text-left font-medium text-slate-950">
                  {course.courseTitle}
                </th>
                <td className="px-4 py-3 text-slate-700">Not available</td>
                <td className="px-4 py-3 text-slate-700">{course.enrollmentStatus}</td>
                <td className="px-4 py-3 text-slate-700">
                  {course.averageGrade === null ? 'Not graded' : `${course.averageGrade}%`}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {course.certificateNo ? (
                    <Link href={`/courses/${course.courseId}/complete`} className="font-semibold text-slate-950 underline">
                      Yes
                    </Link>
                  ) : (
                    'No'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
